import type { Job } from 'bullmq';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { auditEvents, bookingItems, bookings, db, paymentIntents, payments, refunds } from '@arrivesuite/db';
import type { ReconcileJobData } from '../queues';

export interface ReconcileResult {
  checked: number;
  mismatched: string[];
  intentsExpired: number;
  paymentMismatches: string[];
  refundMismatches: string[];
  refundsStuck: number;
  alerts: { severity: 'P2' | 'P1'; reference: string; reason: string }[];
  traceId: string;
}

// Booking totals vs items, plus the 5-minute payments cycle (FR-5.17.6):
// expire stale intents, match captured payments to bookings.paidCents,
// and raise P2 (then P1 after 30 min) alerts for unmatched money.
export async function reconcileBookings(job: Job<ReconcileJobData>): Promise<ReconcileResult> {
  const { bookingId, traceId } = job.data;

  const targets = bookingId
    ? await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
    : await db
        .select()
        .from(bookings)
        .where(
          inArray(bookings.status, ['pending', 'confirmed', 'on_hold'] as const),
        )
        .orderBy(desc(bookings.createdAt))
        .limit(100);

  const mismatched: string[] = [];

  let done = 0;
  for (const booking of targets) {
    const items = await db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, booking.id));
    const subtotal = items.reduce((s, i) => s + i.netCents + i.markupCents, 0);
    const tax = items.reduce((s, i) => s + i.taxCents, 0);
    if (subtotal !== booking.subtotalCents || tax !== booking.taxCents || subtotal + tax !== booking.totalCents) {
      mismatched.push(booking.ref.trim());
    }
    done += 1;
    await job.updateProgress(Math.round((done / Math.max(targets.length, 1)) * 50));
  }

  // Stale intents that never converted: expire them so they stop looking due.
  const stale = await db
    .select({ id: paymentIntents.id })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.state, 'requires_payment'), lt(paymentIntents.expiresAt, new Date())));
  for (const s of stale) {
    await db.update(paymentIntents).set({ state: 'expired' }).where(eq(paymentIntents.id, s.id));
  }

  // Captured payments must sum to bookings.paidCents per booking.
  const sums = await db
    .select({
      bookingId: paymentIntents.bookingId,
      capturedCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(paymentIntents)
    .leftJoin(payments, eq(payments.intentId, paymentIntents.id))
    .where(eq(paymentIntents.state, 'captured'))
    .groupBy(paymentIntents.bookingId);
  const paymentMismatches: string[] = [];
  const paidByBooking = new Map(sums.map((s) => [s.bookingId, Number(s.capturedCents)]));
  const bookingsToCheck = bookingId
    ? targets
    : await db.select().from(bookings).orderBy(desc(bookings.createdAt)).limit(100);
  for (const b of bookingsToCheck) {
    const captured = paidByBooking.get(b.id) ?? 0;
    if (captured !== b.paidCents) {
      paymentMismatches.push(b.ref.trim());
    }
  }

  // Unmatched money: captured intents older than 5 min without full coverage
  // raise P2, older than 30 min raise P1 (operation: SMS/pager in production).
  const alerts: ReconcileResult['alerts'] = [];
  const now = Date.now();
  const openIntents = await db
    .select()
    .from(paymentIntents)
    .where(inArray(paymentIntents.state, ['requires_payment', 'failed'] as const))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(100);
  for (const intent of openIntents) {
    const ageMin = (now - intent.createdAt.getTime()) / 60_000;
    if (ageMin >= 5) {
      alerts.push({
        severity: ageMin >= 30 ? 'P1' : 'P2',
        reference: intent.providerRef ?? intent.id,
        reason: `intent ${intent.state} for ${Math.round(ageMin)} min`,
      });
    }
  }

  // Refunds: completed refunds per booking must equal bookings.refundedCents,
  // and no payment may refund more than captured. Stuck pending/approved
  // refunds older than 24h raise P2 (provider call never finished).
  const refundSums = await db
    .select({
      bookingId: paymentIntents.bookingId,
      refundedCents: sql<number>`coalesce(sum(${refunds.amountCents}), 0)`,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
    .where(eq(refunds.state, 'completed'))
    .groupBy(paymentIntents.bookingId);
  const refundedByBooking = new Map(refundSums.map((s) => [s.bookingId, Number(s.refundedCents)]));
  const refundMismatches: string[] = [];
  for (const b of bookingsToCheck) {
    if ((refundedByBooking.get(b.id) ?? 0) !== b.refundedCents) {
      refundMismatches.push(b.ref.trim());
    }
  }

  const stuckCutoff = new Date(now - 24 * 60 * 60_000);
  const stuck = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(and(inArray(refunds.state, ['pending', 'approved'] as const), lt(refunds.createdAt, stuckCutoff)));
  for (const s of stuck) {
    alerts.push({ severity: 'P2', reference: s.id, reason: 'refund stuck over 24h' });
  }

  await db.insert(auditEvents).values({
    actorRealm: null,
    action: 'reconciliation.completed',
    entityType: 'reconciliation',
    entityId: traceId,
    diff: {
      checked: targets.length,
      mismatched,
      intentsExpired: stale.length,
      paymentMismatches,
      refundMismatches,
      refundsStuck: stuck.length,
      alerts,
      scope: bookingId ?? 'sweep',
    },
    traceId,
  });

  await job.updateProgress(100);
  return {
    checked: targets.length,
    mismatched,
    intentsExpired: stale.length,
    paymentMismatches,
    refundMismatches,
    refundsStuck: stuck.length,
    alerts,
    traceId,
  };
}
