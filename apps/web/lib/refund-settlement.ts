import { eq, sql } from 'drizzle-orm';
import {
  auditEvents,
  bookings,
  db,
  paymentIntents,
  payments,
  refunds,
} from '@arrivesuite/db';
import { canTransition, type BookingStatus } from './booking-state';

export interface RefundSettlement {
  ok: true;
  bookingId: string;
  bookingStatus: BookingStatus;
  refundedCents: number;
  fullyRefunded: boolean;
  statusChanges: { from: BookingStatus; to: BookingStatus }[];
}

export type RefundSettlementResult =
  | RefundSettlement
  | { ok: false; status: number; error: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function transition(
  tx: Tx,
  input: {
    bookingId: string;
    from: BookingStatus;
    to: BookingStatus;
    refundId: string;
    traceId: string;
  },
): Promise<void> {
  await tx
    .update(bookings)
    .set({ status: input.to, updatedAt: new Date() })
    .where(eq(bookings.id, input.bookingId));
  await tx.insert(auditEvents).values({
    action: 'booking.transition',
    entityType: 'booking',
    entityId: input.bookingId,
    diff: {
      from: input.from,
      to: input.to,
      reason: 'full_refund',
      refundId: input.refundId,
    },
    traceId: input.traceId,
  });
}

// The provider refund has already succeeded when this runs. Mark the refund
// completed, add to the booking's refunded total, and move the booking to
// refunded only when the full captured amount has been returned. Section 9.1
// does not allow confirmed/ticketed -> refunded directly, so those states pass
// through cancelled first. All database changes and audit rows are atomic.
export async function settleCompletedRefund(input: {
  refundId: string;
  traceId: string;
}): Promise<RefundSettlementResult> {
  return db.transaction(async (tx) => {
    const [refund] = await tx
      .select()
      .from(refunds)
      .where(eq(refunds.id, input.refundId))
      .limit(1)
      .for('update');
    if (!refund) {
      return { ok: false as const, status: 404, error: 'Refund not found' };
    }

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, refund.paymentId))
      .limit(1);
    if (!payment) {
      return { ok: false as const, status: 409, error: 'Payment missing' };
    }

    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, payment.intentId))
      .limit(1);
    if (!intent) {
      return { ok: false as const, status: 409, error: 'Payment intent missing' };
    }

    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, intent.bookingId))
      .limit(1)
      .for('update');
    if (!booking) {
      return { ok: false as const, status: 409, error: 'Booking missing' };
    }

    if (refund.state === 'completed') {
      return {
        ok: true as const,
        bookingId: booking.id,
        bookingStatus: booking.status as BookingStatus,
        refundedCents: booking.refundedCents,
        fullyRefunded: booking.paidCents > 0 && booking.refundedCents >= booking.paidCents,
        statusChanges: [],
      };
    }
    if (refund.state !== 'approved') {
      return {
        ok: false as const,
        status: 409,
        error: `Refund is ${refund.state}`,
      };
    }

    await tx.update(refunds).set({ state: 'completed' }).where(eq(refunds.id, refund.id));

    const [updated] = await tx
      .update(bookings)
      .set({
        refundedCents: sql`${bookings.refundedCents} + ${refund.amountCents}`,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    let status = booking.status as BookingStatus;
    const fullyRefunded = updated.paidCents > 0 && updated.refundedCents >= updated.paidCents;
    const statusChanges: { from: BookingStatus; to: BookingStatus }[] = [];

    if (fullyRefunded) {
      if (canTransition(status, 'refunded')) {
        await transition(tx, {
          bookingId: booking.id,
          from: status,
          to: 'refunded',
          refundId: refund.id,
          traceId: input.traceId,
        });
        statusChanges.push({ from: status, to: 'refunded' });
        status = 'refunded';
      } else if (
        canTransition(status, 'cancelled') &&
        canTransition('cancelled', 'refunded')
      ) {
        await transition(tx, {
          bookingId: booking.id,
          from: status,
          to: 'cancelled',
          refundId: refund.id,
          traceId: input.traceId,
        });
        statusChanges.push({ from: status, to: 'cancelled' });

        await transition(tx, {
          bookingId: booking.id,
          from: 'cancelled',
          to: 'refunded',
          refundId: refund.id,
          traceId: input.traceId,
        });
        statusChanges.push({ from: 'cancelled', to: 'refunded' });
        status = 'refunded';
      }
    }

    return {
      ok: true as const,
      bookingId: booking.id,
      bookingStatus: status,
      refundedCents: updated.refundedCents,
      fullyRefunded,
      statusChanges,
    };
  });
}
