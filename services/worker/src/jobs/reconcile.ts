import type { Job } from 'bullmq';
import { desc, eq, inArray } from 'drizzle-orm';
import { auditEvents, bookingItems, bookings, db } from '@arrivesuite/db';
import type { ReconcileJobData } from '../queues';

export interface ReconcileResult {
  checked: number;
  mismatched: string[];
  traceId: string;
}

// Phase 0 reconciliation: every booking's stored totals must equal the sum
// of its items. Phase 1 extends this to payments/refunds on the 5-minute
// cycle (FR-5.17.6); the queue, schedule, and audit trail already exist.
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
      mismatched.push(booking.ref);
    }
    done += 1;
    await job.updateProgress(Math.round((done / targets.length) * 100));
  }

  await db.insert(auditEvents).values({
    actorRealm: null,
    action: 'reconciliation.completed',
    entityType: 'reconciliation',
    entityId: traceId,
    diff: {
      checked: targets.length,
      mismatched,
      scope: bookingId ?? 'sweep',
    },
    traceId,
  });

  return { checked: targets.length, mismatched, traceId };
}
