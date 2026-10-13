import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, bookings, bookingItems } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';

// Booking detail is owner-or-admin only. Refs are unguessable but that is
// not authorization — without this check any booking is world-readable.
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { ref } = await params;

  const found = await db.select().from(bookings).where(eq(bookings.ref, ref)).limit(1);
  if (found.length === 0) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (found[0].accountId !== account.id && account.realm !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, found[0].id));
  return NextResponse.json({ booking: { ...found[0], ref: found[0].ref.trim() }, items });
}
