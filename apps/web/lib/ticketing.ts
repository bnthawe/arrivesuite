import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  alertStates,
  auditEvents,
  bookingGuests,
  bookingItems,
  bookings,
  db,
  paymentIntents,
  payments,
} from '@arrivesuite/db';
import { createFlightOrder, ProviderError } from '@arrivesuite/integrations';
import { getRedis, waitUntilRedisReady } from './redis';
import { qrDataUrl, qrPngBuffer, verifyUrlFor } from './qr';
import { generateVoucherPdf, voucherPathFor } from './vouchers';
import { sendBookingTicketing } from './notifications';
import {
  isPostPaymentFlightItem,
  snapshotOf,
  toProviderPassengers,
} from './ticketing-helpers';

const TICKETING_LOCK_SECONDS = 300;

type GuestRow = typeof bookingGuests.$inferSelect;

export type FulfillStatus = 'ticketed' | 'ticketing' | 'no_action';

export type FulfillResult =
  | { ok: true; status: FulfillStatus }
  | { ok: false; status?: FulfillStatus; error: string };

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
    console.error('[ticketing] failed to release lock', err);
  }
}

async function generateVoucher(input: {
  booking: typeof bookings.$inferSelect;
  items: (typeof bookingItems.$inferSelect)[];
  lead: GuestRow | undefined;
  traceId: string;
}): Promise<string | null> {
  const ref = input.booking.ref.trim();
  const verifyUrl = verifyUrlFor(ref);
  try {
    const path = await generateVoucherPdf({
      ref,
      status: 'ticketed',
      currency: input.booking.currency,
      subtotalCents: input.booking.subtotalCents,
      taxCents: input.booking.taxCents,
      totalCents: input.booking.totalCents,
      traceId: input.booking.traceId,
      guestName: input.lead ? `${input.lead.firstName} ${input.lead.lastName}` : null,
      providerRefs: input.items
        .filter((item) => item.itemType === 'flight' && item.confirmationRef)
        .map((item) => ({
          kind: 'flight',
          providerRef: item.confirmationRef ?? '',
          status: item.status,
        })),
      items: input.items.map((item) => ({
        label: item.itemType === 'flight' ? `Flight ${item.itemRef}` : item.itemType,
        itemRef: item.itemRef,
        quantity: item.quantity,
        totalCents: item.totalCents,
        status: item.status,
      })),
      verifyUrl,
      qrPng: qrPngBuffer(await qrDataUrl(verifyUrl)),
    });
    await db.insert(auditEvents).values({
      action: 'booking.voucher_generated',
      entityType: 'booking',
      entityId: input.booking.id,
      diff: { path, ref },
      traceId: input.traceId,
    });
    return path;
  } catch (err) {
    await db.insert(auditEvents).values({
      action: 'booking.voucher_failed',
      entityType: 'booking',
      entityId: input.booking.id,
      diff: { error: (err as Error)?.message ?? 'voucher generation failed' },
      traceId: input.traceId,
    });
    return voucherPathFor(ref);
  }
}

// Called after capture by the DPO return handler. Payment-first flight items
// hold the frozen offer and passengers, so the provider order is created only
// now. The conditional confirmed -> ticketing claim plus a Redis lock makes
// duplicate webhook/return deliveries idempotent.
export async function fulfillPaidBooking(
  bookingId: string,
  traceId: string,
  options: { retryFailed?: boolean } = {},
): Promise<FulfillResult> {
  const [loaded] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!loaded) return { ok: false, error: 'Booking not found' };

  const items = await db
    .select()
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId));
  const fulfillable = items.filter(isPostPaymentFlightItem);
  if (fulfillable.length === 0) return { ok: true, status: 'no_action' };
  if (loaded.status === 'ticketed') return { ok: true, status: 'ticketed' };
  if (loaded.status === 'failed') {
    if (!options.retryFailed) return { ok: false, error: 'Booking is failed' };
    if (loaded.paidCents < loaded.totalCents) {
      return { ok: false, error: 'Booking is not fully paid' };
    }
    const [claimed] = await db
      .update(bookings)
      .set({ status: 'ticketing', updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'failed')))
      .returning();
    if (claimed) {
      await db.insert(auditEvents).values({
        action: 'booking.transition',
        entityType: 'booking',
        entityId: bookingId,
        diff: { from: 'failed', to: 'ticketing', reason: 'admin_ticketing_retry' },
        traceId,
      });
    }
  } else if (loaded.status === 'confirmed') {
    const [claimed] = await db
      .update(bookings)
      .set({ status: 'ticketing', updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
      .returning();
    if (claimed) {
      await db.insert(auditEvents).values({
        action: 'booking.transition',
        entityType: 'booking',
        entityId: bookingId,
        diff: { from: 'confirmed', to: 'ticketing', reason: 'payment_captured_ticketing' },
        traceId,
      });
    }
  }

  const [current] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!current) return { ok: false, error: 'Booking not found' };
  if (current.status === 'ticketed') return { ok: true, status: 'ticketed' };
  if (current.status !== 'ticketing') {
    return { ok: false, error: `Booking is ${current.status}` };
  }

  const lockKey = `ticketing:${bookingId}`;
  const lockValue = randomUUID();
  let acquired = false;
  try {
    const redis = getRedis();
    await waitUntilRedisReady(redis);
    acquired = (await redis.set(lockKey, lockValue, 'EX', TICKETING_LOCK_SECONDS, 'NX')) === 'OK';
  } catch (err) {
    console.error('[ticketing] lock unavailable', err);
    return { ok: false, status: 'ticketing', error: 'Ticketing lock unavailable' };
  }
  if (!acquired) return { ok: true, status: 'ticketing' };

  try {
    // Re-read after acquiring the lock: another worker may have finished
    // between the status check and the lock acquisition.
    const [afterLock] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!afterLock) return { ok: false, error: 'Booking not found' };
    if (afterLock.status === 'ticketed') return { ok: true, status: 'ticketed' };
    if (afterLock.status !== 'ticketing') {
      return { ok: false, error: `Booking is ${afterLock.status}` };
    }
    const lockedItems = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId));
    const workItems = lockedItems.filter(isPostPaymentFlightItem);

    const guests = await db
      .select()
      .from(bookingGuests)
      .where(eq(bookingGuests.bookingId, bookingId));
    const lead = guests.find((guest) => guest.isLead) ?? guests[0];
    const passengers = toProviderPassengers(guests);

    // The provider order must reference the captured payment, not merely the
    // latest intent (a reload can leave an unpaid intent newer than the paid
    // one).
    const [captured] = await db
      .select({ payment: payments, intent: paymentIntents })
      .from(payments)
      .innerJoin(paymentIntents, eq(payments.intentId, paymentIntents.id))
      .where(and(eq(paymentIntents.bookingId, bookingId), eq(payments.status, 'captured')))
      .orderBy(desc(payments.capturedAt))
      .limit(1);
    let paymentToken = `booking:${current.ref.trim()}`;
    if (captured) {
      paymentToken =
        captured.payment.providerPaymentId ??
        captured.payment.id ??
        captured.intent.providerRef ??
        paymentToken;
    }

    const guestInfo =
      lead?.email && lead.phoneE164
        ? {
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phoneE164,
          }
        : undefined;

    for (const item of workItems) {
      if (item.confirmationRef) continue;
      const snapshot = snapshotOf(item.snapshot);
      if (!snapshot.flightOffer) {
        throw new Error(`Flight offer snapshot missing for ${item.itemRef}`);
      }
      const order = await createFlightOrder({
        offerId: item.itemRef,
        paymentToken,
        passengers,
        ...(guestInfo ? { guestInfo } : {}),
        idempotencyKey: `ticketing:${bookingId}:${item.id}`,
      });

      const [updated] = await db
        .update(bookingItems)
        .set({
          status: 'confirmed',
          confirmationRef: order.orderId,
          snapshot: {
            ...snapshot,
            providerOrderId: order.orderId,
            pnr: order.pnr,
            ticket: order.ticket,
            pdf: order.pdf,
            ticketedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(and(eq(bookingItems.id, item.id), isNull(bookingItems.confirmationRef)))
        .returning();
      if (!updated) continue;

      await db.insert(auditEvents).values({
        action: 'booking_item.ticketed',
        entityType: 'booking_item',
        entityId: item.id,
        diff: {
          bookingId,
          itemRef: item.itemRef,
          providerOrderId: order.orderId,
          pnr: order.pnr,
        },
        traceId,
      });
    }

    const [ticketed] = await db
      .update(bookings)
      .set({ status: 'ticketed', updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'ticketing')))
      .returning();

    if (!ticketed) {
      const [latest] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
      if (latest?.status !== 'ticketed') {
        throw new Error(`Booking did not reach ticketed (${latest?.status ?? 'missing'})`);
      }
    } else {
      await db.insert(auditEvents).values({
        action: 'booking.transition',
        entityType: 'booking',
        entityId: bookingId,
        diff: { from: 'ticketing', to: 'ticketed', reason: 'provider_order_created' },
        traceId,
      });
    }

    const finalItems = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId));
    await generateVoucher({ booking: current, items: finalItems, lead, traceId });

    const pnrs = finalItems
      .map((item) => snapshotOf(item.snapshot).pnr)
      .filter((pnr): pnr is string => Boolean(pnr));
    await sendBookingTicketing({
      phone: lead?.phoneE164,
      arsRef: current.ref.trim(),
      pnr: pnrs.join(', '),
      totalLine: `${current.currency} ${(current.totalCents / 100).toFixed(2)}`,
      traceId,
      bookingId,
    });

    return { ok: true, status: 'ticketed' };
  } catch (err) {
    const message = (err as Error)?.message ?? 'ticketing failed';
    const providerDetails =
      err instanceof ProviderError
        ? {
            provider: err.provider,
            code: err.code,
            status: err.status,
            retryable: err.retryable,
          }
        : {};
    // Only a booking still in ticketing may be marked failed. If the ticket
    // was already issued and a later side effect (voucher/WhatsApp) failed,
    // keep the ticketed state and record the side-effect error instead.
    const [failed] = await db
      .update(bookings)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'ticketing')))
      .returning();

    if (!failed) {
      await db.insert(auditEvents).values({
        action: 'booking.ticketing_post_complete_error',
        entityType: 'booking',
        entityId: bookingId,
        diff: { error: message, ...providerDetails },
        traceId,
      });
      return { ok: false, error: message };
    }

    await db.insert(auditEvents).values({
      action: 'booking.ticketing_failed',
      entityType: 'booking',
      entityId: bookingId,
      diff: { error: message, ...providerDetails },
      traceId,
    });
    try {
      const [existingAlert] = await db
        .select()
        .from(alertStates)
        .where(
          and(
            eq(alertStates.kind, 'ticketing_failed'),
            eq(alertStates.reference, current.ref.trim()),
            isNull(alertStates.resolvedAt),
          ),
        )
        .limit(1);
      if (existingAlert) {
        await db
          .update(alertStates)
          .set({
            lastNotifiedAt: new Date(),
            details: { bookingId, error: message, ...providerDetails },
          })
          .where(eq(alertStates.id, existingAlert.id));
      } else {
        await db.insert(alertStates).values({
          kind: 'ticketing_failed',
          reference: current.ref.trim(),
          severity: 'P1',
          details: { bookingId, error: message, ...providerDetails },
        });
      }
    } catch (alertErr) {
      console.error('[ticketing] failed to record alert', alertErr);
    }
    return { ok: false, error: message };
  } finally {
    await releaseLock(lockKey, lockValue);
  }
}
