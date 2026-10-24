// §6.4 PII retention and redaction.
//
// Redacts guest PII from booking_guests after the retention window or on
// admin request. Keeps the booking structure intact for accounting/audit.

import { eq } from 'drizzle-orm';
import { auditEvents, bookingGuests, bookings, db } from '@arrivesuite/db';

const REDACTED = '[redacted]';

export interface RedactionResult {
  bookingRef: string;
  guestsRedacted: number;
  alreadyRedacted: boolean;
}

export async function redactBookingPii(ref: string, actorId?: string): Promise<RedactionResult | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ref, ref.trim()))
    .limit(1);
  if (!booking) return null;

  const guests = await db
    .select()
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, booking.id));

  // Check if already redacted
  const alreadyRedacted = guests.every(
    (g) => g.firstName === REDACTED && g.lastName === REDACTED,
  );
  if (alreadyRedacted) {
    return { bookingRef: booking.ref, guestsRedacted: 0, alreadyRedacted: true };
  }

  let count = 0;
  for (const guest of guests) {
    await db
      .update(bookingGuests)
      .set({
        firstName: REDACTED,
        lastName: REDACTED,
        dateOfBirth: null,
        passportNumber: null,
        passportExpiry: null,
        nationality: null,
        email: null,
        phoneE164: null,
      })
      .where(eq(bookingGuests.id, guest.id));
    count++;
  }

  await db.insert(auditEvents).values({
    ...(actorId ? { actorId, actorRealm: 'admin' as const } : {}),
    action: 'booking.pii_redacted',
    entityType: 'booking',
    entityId: booking.id,
    diff: { guestsRedacted: count },
    traceId: `redact-${Date.now()}`,
  });

  return { bookingRef: booking.ref, guestsRedacted: count, alreadyRedacted: false };
}

// Retention policy: redact PII for bookings older than the retention window.
// Returns the number of bookings redacted.
export async function redactExpiredPii(retentionDays: number = 7 * 365): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const oldBookings = await db
    .select({ ref: bookings.ref })
    .from(bookings)
    .where(eq(bookings.status, 'refunded')); // only redact completed/refunded bookings

  // Actually, we should redact all bookings older than cutoff, not just refunded
  const allOld = await db
    .select({ ref: bookings.ref, createdAt: bookings.createdAt })
    .from(bookings);

  let redacted = 0;
  for (const booking of allOld) {
    if (new Date(booking.createdAt) < cutoff) {
      const result = await redactBookingPii(booking.ref);
      if (result && !result.alreadyRedacted) {
        redacted++;
      }
    }
  }
  return redacted;
}