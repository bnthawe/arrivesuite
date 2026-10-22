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
      refund: RefundRow | null;
      refundError?: string;
      refundAmountCents: number;
      providerQuote: FlightCancellationQuote | null;
      providerCancellation: FlightCancellationResult | null;
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

// Phase 1 cancellation is intentionally narrow: one sourced flight item, an
// explicit fare-refundable flag, and a single captured payment. Anything more
// complex is escalated rather than guessed at.
export async function cancelBooking(input: {
  ref: string;
  reasonCode?: string;
  remarks?: string;
  traceId: string;
  actorId?: string;
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
  const flightItems = items.filter((item) => item.itemType === 'flight');
  const currentItem = flightItems[0] ?? null;

  if (booking.status === 'cancelled' || booking.status === 'refunded') {
    return {
      ok: true,
      alreadyCancelled: true,
      booking,
      item: currentItem,
      refund: null,
      refundAmountCents: 0,
      providerQuote: null,
      providerCancellation: null,
    };
  }
  if (!CANCELLABLE.has(booking.status as BookingStatus)) {
    return {
      ok: false,
      status: 409,
      error: `Booking is ${booking.status} and cannot be cancelled`,
    };
  }
  if (flightItems.length !== 1 || !currentItem) {
    return {
      ok: false,
      status: 409,
      error: 'Flight cancellation requires exactly one flight item; use manual handling',
    };
  }
  if (currentItem.status === 'cancelled') {
    return {
      ok: false,
      status: 409,
      error: 'The flight item is already cancelled',
    };
  }

  const snapshot = snapshotOf(currentItem.snapshot);
  const offer = snapshot.flightOffer as { refundable?: boolean } | undefined;
  if (!offer || typeof offer.refundable !== 'boolean') {
    return {
      ok: false,
      status: 409,
      error: 'Fare rules are unavailable for this item; use the manual refund workflow',
    };
  }
  const fareRefundable = offer.refundable;

  let quote: FlightCancellationQuote | null = null;
  if (currentItem.confirmationRef) {
    try {
      quote = await getFlightCancellationQuote(currentItem.confirmationRef);
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
    if (!quote.cancellable) {
      return {
        ok: false,
        status: 409,
        error: 'The provider says this order is not currently cancellable',
        details: quote,
      };
    }
    if (quote.supportRequired) {
      return {
        ok: false,
        status: 409,
        error: 'The provider requires OnArrival support to cancel this order',
        details: quote,
      };
    }
  }

  const requestedCode = input.reasonCode ?? DEFAULT_REASON.code;
  const reason: FlightCancellationReason =
    quote?.reasons.find((row) => row.code === requestedCode && !row.additionalReason) ??
    quote?.reasons.find((row) => !row.additionalReason) ?? {
      code: requestedCode,
      display: requestedCode === DEFAULT_REASON.code ? DEFAULT_REASON.display : requestedCode,
    };

  const paidRemaining = Math.max(0, booking.paidCents - booking.refundedCents);
  let refundAmountCents =
    quote?.estimatedRefundMinor != null
      ? quote.estimatedRefundMinor
      : fareRefundable
        ? paidRemaining
        : 0;
  refundAmountCents = Math.max(0, Math.min(refundAmountCents, paidRemaining));

  let refundPayment: PaymentRow | null = null;
  if (refundAmountCents > 0) {
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
    refundAmountCents = Math.min(
      refundAmountCents,
      Math.max(0, refundPayment.amountCents - encumbered),
    );
  }

  const lockKey = `cancelling:${booking.id}`;
  const lockValue = randomUUID();
  const ticketingLockKey = `ticketing:${booking.id}`;
  const ticketingLockValue = randomUUID();
  let acquired = false;
  let ticketingLocked = false;
  try {
    const redis = getRedis();
    await waitUntilRedisReady(redis);
    acquired =
      (await redis.set(lockKey, lockValue, 'EX', LOCK_SECONDS, 'NX')) === 'OK';
    if (acquired) {
      // Block a concurrent paid ticketing run. Cancelling a provider order
      // while the order is being created would leave the local state wrong.
      ticketingLocked =
        (await redis.set(ticketingLockKey, ticketingLockValue, 'EX', LOCK_SECONDS, 'NX')) ===
        'OK';
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
    const [fresh] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id))
      .limit(1);
    const [freshItem] = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.id, currentItem.id))
      .limit(1);
    if (!fresh || !freshItem) {
      return { ok: false, status: 409, error: 'Booking changed while cancelling' };
    }
    if (fresh.status === 'cancelled' || fresh.status === 'refunded') {
      return {
        ok: true,
        alreadyCancelled: true,
        booking: fresh,
        item: freshItem,
        refund: null,
        refundAmountCents: 0,
        providerQuote: quote,
        providerCancellation: null,
      };
    }
    if (!CANCELLABLE.has(fresh.status as BookingStatus)) {
      return {
        ok: false,
        status: 409,
        error: `Booking is ${fresh.status} and cannot be cancelled`,
      };
    }
    if (freshItem.confirmationRef !== currentItem.confirmationRef) {
      return {
        ok: false,
        status: 409,
        error: 'The provider order changed while cancelling; reload and try again',
      };
    }

    let providerCancellation: FlightCancellationResult | null = null;
    if (freshItem.confirmationRef) {
      try {
        providerCancellation = await cancelFlightOrder({
          orderId: freshItem.confirmationRef,
          code: reason.code,
          reason: reason.display,
          additionalReason: reason.additionalReason ?? false,
          remarks: input.remarks ?? `Admin cancellation for ${ref}`,
        });
      } catch (err) {
        const details =
          err instanceof ProviderError
            ? {
                provider: err.provider,
                code: err.code,
                status: err.status,
                retryable: err.retryable,
              }
            : {};
        return {
          ok: false,
          status: 502,
          error: 'The provider cancellation failed',
          details: { error: (err as Error)?.message ?? 'provider error', ...details },
        };
      }
    }

    const now = new Date();
    const cancelled = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, booking.id))
        .limit(1)
        .for('update');
      if (!locked || locked.status !== fresh.status) {
        return {
          ok: false as const,
          status: 409,
          error: 'Booking changed while cancelling',
        };
      }
      if (!canTransition(locked.status as BookingStatus, 'cancelled')) {
        return {
          ok: false as const,
          status: 409,
          error: `Booking is ${locked.status} and cannot be cancelled`,
        };
      }

      const cancellationSnapshot = {
        ...snapshotOf(freshItem.snapshot),
        cancelledAt: now.toISOString(),
        cancellationId: providerCancellation?.cancellationId ?? null,
        cancellationStatus: providerCancellation?.bookingStatus ?? 'CANCELLED',
        cancellation: {
          at: now.toISOString(),
          reasonCode: reason.code,
          reason: reason.display,
          remarks: input.remarks ?? null,
          providerOrderId: freshItem.confirmationRef,
          providerBookingStatus: providerCancellation?.bookingStatus ?? null,
          cancellationId: providerCancellation?.cancellationId ?? null,
          refundAmountCents,
          fareRefundable,
          providerRefundMinor: quote?.estimatedRefundMinor ?? null,
        },
      };
      const [updatedItem] = await tx
        .update(bookingItems)
        .set({
          status: 'cancelled',
          snapshot: cancellationSnapshot,
          updatedAt: now,
        })
        .where(eq(bookingItems.id, freshItem.id))
        .returning();
      if (!updatedItem) {
        return { ok: false as const, status: 409, error: 'Flight item changed' };
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
            providerOrderIds: freshItem.confirmationRef ? [freshItem.confirmationRef] : [],
          },
        },
        {
          ...auditBase,
          action: 'booking.cancelled',
          diff: {
            reasonCode: reason.code,
            reason: reason.display,
            remarks: input.remarks ?? null,
            refundAmountCents,
            fareRefundable,
            providerQuote: quote,
            providerCancellation,
            itemId: freshItem.id,
          },
        },
      ]);

      return { ok: true as const, booking: updatedBooking, item: updatedItem };
    });

    if (!cancelled.ok) return cancelled;

    let refund: RefundRow | null = null;
    let refundError: string | undefined;
    if (refundAmountCents > 0 && refundPayment) {
      const created = await createRefundRequest({
        paymentId: refundPayment.id,
        amountCents: refundAmountCents,
        reason: `Flight cancellation ${ref}`,
        traceId: input.traceId,
        ...(input.actorId
          ? { actorId: input.actorId, actorRealm: 'admin' as const }
          : {}),
      });
      if (created.ok) {
        refund = created.refund;
      } else {
        refundError = created.error;
        await recordRefundFailure({
          booking: cancelled.booking,
          amountCents: refundAmountCents,
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
      item: cancelled.item,
      refund,
      ...(refundError ? { refundError } : {}),
      refundAmountCents,
      providerQuote: quote,
      providerCancellation,
    };
  } finally {
    await releaseLock(lockKey, lockValue);
    await releaseLock(ticketingLockKey, ticketingLockValue);
  }
}
