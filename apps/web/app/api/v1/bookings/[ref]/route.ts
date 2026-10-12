import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, bookings, bookingItems } from '@arrivesuite/db';

export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;

  const found = await db.select().from(bookings).where(eq(bookings.ref, ref)).limit(1);
  if (found.length === 0) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, found[0].id));
  return NextResponse.json({ booking: { ...found[0], ref: found[0].ref.trim() }, items });
}
