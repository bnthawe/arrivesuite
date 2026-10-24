import type { Job } from 'bullmq';
import { db } from '@arrivesuite/db';

export interface RetentionJobData {
  retentionDays?: number;
  traceId: string;
}

export interface RetentionResult {
  redacted: number;
  traceId: string;
}

// Retention: redact PII for bookings older than the retention window.
// 7 years = 2555 days per §6.14.
export async function runRetention(job: Job<RetentionJobData>): Promise<RetentionResult> {
  const { retentionDays = 7 * 365, traceId } = job.data;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Find bookings older than cutoff that haven't been redacted yet.
  // We check booking_guests for non-redacted PII.
  const { bookings, bookingGuests } = await import('@arrivesuite/db');
  const { lt, eq, and, isNull, or, sql } = await import('drizzle-orm');

  const oldBookings = await db
    .select({ id: bookings.id, ref: bookings.ref })
    .from(bookings)
    .where(lt(bookings.createdAt, cutoff));

  let redacted = 0;
  for (const booking of oldBookings) {
    // Check if any guest still has PII
    const guests = await db
      .select({ id: bookingGuests.id, firstName: bookingGuests.firstName })
      .from(bookingGuests)
      .where(eq(bookingGuests.bookingId, booking.id));

    const hasPii = guests.some((g) => g.firstName !== '[redacted]');
    if (!hasPii) continue;

    // Redact all guests for this booking
    await db
      .update(bookingGuests)
      .set({
        firstName: '[redacted]',
        lastName: '[redacted]',
        dateOfBirth: null,
        passportNumber: null,
        passportExpiry: null,
        nationality: null,
        email: null,
        phoneE164: null,
      })
      .where(eq(bookingGuests.bookingId, booking.id));

    redacted++;
    await job.updateProgress(Math.round((redacted / oldBookings.length) * 100));
  }

  console.log(`[retention] redacted ${redacted} booking(s) older than ${retentionDays} days`);
  return { redacted, traceId };
}