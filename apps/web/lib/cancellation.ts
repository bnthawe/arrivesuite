import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  alertStates,
  auditEvents,
  bookingItems,
  bookings,
  db,
  paymentIntents,
  payments,
  refunds,
} from '@arrivesuite/db';
import {
  cancelFlightOrder,
  getFlightCancellationQuote,
  ProviderError,
} from '@arrivesuite/integrations';
import type {
  FlightCancellationQuote,
  FlightCancellationReason,
  FlightCancellationResult,
} from '@arrivesuite/types';
import { canTransition, type BookingStatus } from './booking-state';
import { createRefundRequest } from './refunds';
import { getRedis, waitUntilRedisReady } from './redis';
import { snapshotOf } from './ticketing-helpers';
import {
  computeCancellation,
  aggregateCancellations,
  type CancellationPolicy,
  type ItemSupplierType,
  type ItemType,
  type PolicyInput,
} from './cancellation-policy';

const LOCK_SECONDS = 300;
const CANCELLABLE: ReadonlySet<BookingStatus> = new Set([
  'confirmed',
  'ticketed',
  'fulfilled',
  'on_hold',
]);
const DEFAULT_REASON = { code: 'CR01', display: 'My plans changed' };

type BookingRow = typeof bookings.$inferSelect;
type ItemRow = typeof bookingItems.$inferSelect;
type RefundRow = typeof refunds.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

export type CancelBookingResult =
  | {
      ok: true;
      alreadyCancelled: boolean;
      booking: BookingRow;
      item: ItemRow | null;
      items: ItemRow[];
      refund: RefundRow | null;
      refundError?: string;
      refundAmountCents: number;
      providerQuote: FlightCancellationQuote | null;
      providerCancellation: FlightCancellationResult | null;
      outcomes: ReturnType<typeof aggregateCancellations>;
    }
  | { ok: false; status: number; error: string; details?: unknown };

async function releaseLock(key: string, value: string): Promise<void> {
  try {
    const redis = getRedis();
    await waitUntilRedisReady(redis);
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end",
      1,
      key,
      value,
    );
  } catch (err) {
    console.error('[cancellation] failed to release lock', err);
  }
}

async function recordRefundFailure(input: {
  booking: BookingRow;
  amountCents: number;
  error: string;
  traceId: string;
  actorId?: string;
}): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      ...(input.actorId ? { actorId: input.actorId, actorRealm: 'admin' as const } : {}),
      action: 'booking.cancellation_refund_failed',
      entityType: 'booking',
      entityId: input.booking.id,
      diff: { amountCents: input.amountCents, error: input.error },
      traceId: input.traceId,
    });
    const [existing] = await db
      .select()
      .from(alertStates)
      .where(
        and(
          eq(alertStates.kind, 'cancellation_refund_failed'),
          eq(alertStates.reference, input.booking.ref.trim()),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(alertStates)
        .set({
          resolvedAt: null,
          lastNotifiedAt: new Date(),
          severity: 'P1',
          details: {
            bookingId: input.booking.id,
            amountCents: input.amountCents,
            error: input.error,
          },
        })
        .where(eq(alertStates.id, existing.id));
    } else {
      await db.insert(alertStates).values({
        kind: 'cancellation_refund_failed',
        reference: input.booking.ref.trim(),
        severity: 'P1',
        details: {
          bookingId: input.booking.id,
          amountCents: input.amountCents,
          error: input.error,
        },
      });
    }
  } catch (err) {
    console.error('[cancellation] failed to record refund failure', err);
  }
}

// Determine the cancellation policy for an item based on its type and snapshot.
function itemPolicy(item: ItemRow): CancellationPolicy {
  const snapshot = snapshotOf(item.snapshot);
  // Flight: use fare refundable flag → flexible if refundable, non_refundable if not
  if (item.itemType === 'flight') {
    const offer = snapshot.flightOffer as { refundable?: boolean } | undefined;
    return offer?.refundable ? 'flexible' : 'non_refundable';
  }
  // Hotel: read from snapshot (rate plan policy) or default flexible
  if (item.itemType === 'hotel') {
    const policy = snapshot.cancellationPolicy as string | undefined;
    if (policy === 'moderate' || policy === 'strict' || policy === 'non_refundable') {
      return policy;
    }
    return 'flexible';
  }
  // Tour/activity/transfer: default flexible (can be overridden by snapshot)
  const policy = snapshot.cancellationPolicy as string | undefined;
  if (policy === 'moderate' || policy === 'strict' || policy === 'non_refundable') {
    return policy;
  }
  return 'flexible';
}

// Determine if an item is refundable at all.
function itemRefundable(item: ItemRow): boolean {
  const snapshot = snapshotOf(item.snapshot);
  if (item.itemType === 'flight') {
    const offer = snapshot.flightOffer as { refundable?: boolean } | undefined;
    return offer?.refundable === true;
  }
  if (item.itemType === 'hotel') {
    return snapshot.refundable !== false;
  }
  return true;
}

// Get service start date from item.
function itemServiceDate(item: ItemRow): Date {
  if (item.startDate) return new Date(item.startDate);
  const snapshot = snapshotOf(item.snapshot);
  // Flight: departure date
  const depDate = snapshot.departureDate as string | undefined;
  if (depDate) return new Date(depDate);
  // Hotel: check-in
  const checkIn = snapshot.checkIn as string | undefined;
  if (checkIn) return new Date(checkIn);
  return new Date();
}

// Get nights for hotel items.
function itemNights(item: ItemRow): number {
  const snapshot = snapshotOf(item.snapshot);
  const nights = snapshot.nights as number | undefined;
  if (typeof nights === 'number' && nights > 0) return nights;
  if (item.startDate && item.endDate) {
    const ms = new Date(item.endDate).getTime() - new Date(item.startDate).getTime();
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
  }
  return 1;
}

export async function cancelBooking(input: {
  ref: string;
  reasonCode?: string;
  remarks?: string;
  traceId: string;
  actorId?: string;
  supplierInitiated?: boolean;
}): Promise<CancelBookingResult> {
  const ref = input.ref.trim();
  if (!ref) return { ok: false, status: 400, error: 'Booking ref is required' };

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ref, ref))
    .limit(1);
  if (!booking) return { ok: false, status: 404, error: 'Booking not found' };

  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, booking.id));

  if (booking.status === 'cancelled' || booking.status === 'refunded') {
    return {
      ok: true,
      alreadyCancelled: true,
      booking,
      item: items[0] ?? null,
      items,
      refund: null,
      refundAmountCents: 0,
      providerQuote: null,
      providerCancellation: null,
      outcomes: aggregateCancellations([]),
    };
  }
  if (!CANCELLABLE.has(booking.status as BookingStatus)) {
    return {
      ok: false,
      status: 409,
      error: `Booking is ${booking.status} and cannot be cancelled`,
    };
  }

  // Check all items are cancellable (not already cancelled)
  const activeItems = items.filter((item) => item.status !== 'cancelled');
  if (activeItems.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'All items are already cancelled',
    };
  }

  // For flights, fetch provider quotes
  const flightItems = activeItems.filter((item) => item.itemType === 'flight');
  const quotes: Map<string, FlightCancellationQuote> = new Map();
  for (const item of flightItems) {
    if (item.confirmationRef) {
      try {
        const q = await getFlightCancellationQuote(item.confirmationRef);
        if (!q.cancellable) {
          return {
            ok: false,
            status: 409,
            error: 'The provider says this order is not currently cancellable',
            details: q,
          };
        }
        if (q.supportRequired) {
          return {
            ok: false,
            status: 409,
            error: 'The provider requires OnArrival support to cancel this order',
            details: q,
          };
        }
        quotes.set(item.id, q);
      } catch (err) {
        const details =
          err instanceof ProviderError
            ? { provider: err.provider, code: err.code, status: err.status, retryable: err.retryable }
            : {};
        return {
          ok: false,
          status: 502,
          error: 'Could not fetch the provider cancellation quote',
          details: { error: (err as Error)?.message ?? 'provider error', ...details },
        };
      }
    }
  }

  const requestedCode = input.reasonCode ?? DEFAULT_REASON.code;

  // Compute policy outcome per item
  const now = new Date();
  const outcomes: Array<{ item: ItemRow; outcome: ReturnType<typeof computeCancellation>; quote: FlightCancellationQuote | null }> = [];

  for (const item of activeItems) {
    const snapshot = snapshotOf(item.snapshot);
    const supplierType = item.itemSupplierType as ItemSupplierType;
    const itemType = item.itemType as ItemType;
    const supplierInitiated = input.supplierInitiated === true && supplierType === 'owned';

    const policyInput: PolicyInput = {
      policy: itemPolicy(item),
      itemType,
      supplierType,
      itemTotalCents: item.totalCents,
      netCents: item.netCents,
      markupCents: item.markupCents,
      serviceStartDate: itemServiceDate(item),
      cancelledAt: now,
      refundable: itemRefundable(item),
      supplierInitiated,
      nights: itemType === 'hotel' ? itemNights(item) : undefined,
      providerQuoteRefundCents:
        itemType === 'flight' && quotes.has(item.id)
          ? quotes.get(item.id)!.estimatedRefundMinor ?? null
          : null,
    };

    const outcome = computeCancellation(policyInput);
    outcomes.push({ item, outcome, quote: quotes.get(item.id) ?? null });
  }

  const aggregated = aggregateCancellations(outcomes.map((o) => o.outcome));
  if (!aggregated.allAllowed) {
    return {
      ok: false,
      status: 409,
      error: 'One or more items cannot be cancelled',
    };
  }

  // Provider cancellation for flight items with confirmationRef
  const providerCancellations: Map<string, FlightCancellationResult> = new Map();
  for (const { item } of outcomes) {
    if (item.itemType === 'flight' && item.confirmationRef) {
      const quote = quotes.get(item.id);
      const reason: FlightCancellationReason =
        quote?.reasons.find((row) => row.code === requestedCode && !row.additionalReason) ??
        quote?.reasons.find((row) => !row.additionalReason) ?? {
          code: requestedCode,
          display: requestedCode === DEFAULT_REASON.code ? DEFAULT_REASON.display : requestedCode,
        };
      try {
        const pc = await cancelFlightOrder({
          orderId: item.confirmationRef,
          code: reason.code,
          reason: reason.display,
          additionalReason: reason.additionalReason ?? false,
          remarks: input.remarks ?? `Admin cancellation for ${ref}`,
          idempotencyKey: `cancel:${booking.id}:${item.id}`,
        });
        providerCancellations.set(item.id, pc);
      } catch (err) {
        const details =
          err instanceof ProviderError
            ? { provider: err.provider, code: err.code, status: err.status, retryable: err.retryable }
            : {};
        return {
          ok: false,
          status: 502,
          error: 'The provider cancellation failed',
          details: { error: (err as Error)?.message ?? 'provider error', ...details },
        };
      }
    }
  }

  // Locks
  const lockKey = `cancelling:${booking.id}`;
  const lockValue = randomUUID();
  const ticketingLockKey = `ticketing:${booking.id}`;
  const ticketingLockValue = randomUUID();
  let acquired = false;
  let ticketingLocked = false;
  try {
    const redis = getRedis();
    await waitUntilRedisReady(redis);
    acquired = (await redis.set(lockKey, lockValue, 'EX', LOCK_SECONDS, 'NX')) === 'OK';
    if (acquired) {
      ticketingLocked =
        (await redis.set(ticketingLockKey, ticketingLockValue, 'EX', LOCK_SECONDS, 'NX')) === 'OK';
    }
  } catch (err) {
    console.error('[cancellation] lock unavailable', err);
    return { ok: false, status: 503, error: 'Cancellation lock unavailable' };
  }
  if (!acquired || !ticketingLocked) {
    if (acquired) await releaseLock(lockKey, lockValue);
    if (ticketingLocked) await releaseLock(ticketingLockKey, ticketingLockValue);
    return {
      ok: false,
      status: 409,
      error: acquired
        ? 'Ticketing is in progress for this booking; retry shortly'
        : 'Cancellation is already in progress',
    };
  }

  try {
    // Freshness check
    const [fresh] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id))
      .limit(1);
    if (!fresh) {
      return { ok: false, status: 409, error: 'Booking changed while cancelling' };
    }
    if (fresh.status === 'cancelled' || fresh.status === 'refunded') {
      return {
        ok: true,
        alreadyCancelled: true,
        booking: fresh,
        item: activeItems[0] ?? null,
        items: activeItems,
        refund: null,
        refundAmountCents: 0,
        providerQuote: null,
        providerCancellation: null,
        outcomes: aggregateCancellations([]),
      };
    }
    if (!CANCELLABLE.has(fresh.status as BookingStatus)) {
      return {
        ok: false,
        status: 409,
        error: `Booking is ${fresh.status} and cannot be cancelled`,
      };
    }

    const paidRemaining = Math.max(0, booking.paidCents - booking.refundedCents);
    let totalRefundAmountCents = Math.max(0, Math.min(aggregated.totalGuestRefundCents, paidRemaining));

    // Payment lookup for refund
    let refundPayment: PaymentRow | null = null;
    if (totalRefundAmountCents > 0) {
      const captured = await db
        .select({ payment: payments })
        .from(payments)
        .innerJoin(paymentIntents, eq(payments.intentId, paymentIntents.id))
        .where(
          and(
            eq(paymentIntents.bookingId, booking.id),
            eq(payments.status, 'captured'),
          ),
        );
      const capturedPayment = captured[0]?.payment;
      if (captured.length !== 1 || !capturedPayment) {
        return {
          ok: false,
          status: 409,
          error:
            captured.length === 0
              ? 'A refund is due but no captured payment was found; use manual review'
              : 'Multiple captured payments found; use the manual refund workflow',
        };
      }
      refundPayment = capturedPayment;
      const existing = await db
        .select({ amountCents: refunds.amountCents, state: refunds.state })
        .from(refunds)
        .where(eq(refunds.paymentId, refundPayment.id));
      const encumbered = existing
        .filter((row) => row.state !== 'failed')
        .reduce((sum, row) => sum + row.amountCents, 0);
      totalRefundAmountCents = Math.min(
        totalRefundAmountCents,
        Math.max(0, refundPayment.amountCents - encumbered),
      );
    }

    const cancelled = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, booking.id))
        .limit(1)
        .for('update');
      if (!locked || locked.status !== fresh.status) {
        return { ok: false as const, status: 409, error: 'Booking changed while cancelling' };
      }
      if (!canTransition(locked.status as BookingStatus, 'cancelled')) {
        return { ok: false as const, status: 409, error: `Booking is ${locked.status} and cannot be cancelled` };
      }

      const updatedItems: ItemRow[] = [];
      for (const { item, outcome } of outcomes) {
        const pc = providerCancellations.get(item.id) ?? null;
        const cancellationSnapshot = {
          ...snapshotOf(item.snapshot),
          cancelledAt: now.toISOString(),
          cancellation: {
            at: now.toISOString(),
            reasonCode: requestedCode,
            remarks: input.remarks ?? null,
            providerOrderId: item.confirmationRef,
            providerBookingStatus: pc?.bookingStatus ?? null,
            cancellationId: pc?.cancellationId ?? null,
            refundAmountCents: outcome.guestRefundCents,
            feeRetainedCents: outcome.feeRetainedCents,
            supplierPayoutAdjustmentCents: outcome.supplierPayoutAdjustmentCents,
            commissionOutcomeCents: outcome.commissionOutcomeCents,
            guestMessage: outcome.guestMessage,
            policy: itemPolicy(item),
            supplierInitiated: input.supplierInitiated === true,
          },
        };
        const [updatedItem] = await tx
          .update(bookingItems)
          .set({
            status: 'cancelled',
            snapshot: cancellationSnapshot,
            updatedAt: now,
          })
          .where(eq(bookingItems.id, item.id))
          .returning();
        if (!updatedItem) {
          return { ok: false as const, status: 409, error: `Item ${item.id} changed` };
        }
        updatedItems.push(updatedItem);
      }

      const [updatedBooking] = await tx
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, locked.status)))
        .returning();
      if (!updatedBooking) {
        return { ok: false as const, status: 409, error: 'Booking changed while cancelling' };
      }

      const auditBase = {
        ...(input.actorId ? { actorId: input.actorId, actorRealm: 'admin' as const } : {}),
        entityType: 'booking',
        entityId: booking.id,
        traceId: input.traceId,
      };
      await tx.insert(auditEvents).values([
        {
          ...auditBase,
          action: 'booking.transition',
          diff: {
            from: locked.status,
            to: 'cancelled',
            reason: 'admin_cancellation',
            providerOrderIds: activeItems
              .filter((i) => i.confirmationRef)
              .map((i) => i.confirmationRef),
          },
        },
        {
          ...auditBase,
          action: 'booking.cancelled',
          diff: {
            reasonCode: requestedCode,
            remarks: input.remarks ?? null,
            refundAmountCents: totalRefundAmountCents,
            itemCount: activeItems.length,
            supplierInitiated: input.supplierInitiated === true,
            outcomes: aggregated,
          },
        },
      ]);

      return { ok: true as const, booking: updatedBooking, items: updatedItems };
    });

    if (!cancelled.ok) return cancelled;

    let refund: RefundRow | null = null;
    let refundError: string | undefined;
    if (totalRefundAmountCents > 0 && refundPayment) {
      const created = await createRefundRequest({
        paymentId: refundPayment.id,
        amountCents: totalRefundAmountCents,
        reason: `Cancellation ${ref} (${activeItems.length} item(s))`,
        traceId: input.traceId,
        ...(input.actorId ? { actorId: input.actorId, actorRealm: 'admin' as const } : {}),
      });
      if (created.ok) {
        refund = created.refund;
      } else {
        refundError = created.error;
        await recordRefundFailure({
          booking: cancelled.booking,
          amountCents: totalRefundAmountCents,
          error: created.error,
          traceId: input.traceId,
          actorId: input.actorId,
        });
      }
    }

    return {
      ok: true,
      alreadyCancelled: false,
      booking: cancelled.booking,
      item: cancelled.items[0] ?? null,
      items: cancelled.items,
      refund,
      ...(refundError ? { refundError } : {}),
      refundAmountCents: totalRefundAmountCents,
      providerQuote: null,
      providerCancellation: null,
      outcomes: aggregated,
    };
  } finally {
    await releaseLock(lockKey, lockValue);
    await releaseLock(ticketingLockKey, ticketingLockValue);
  }
}