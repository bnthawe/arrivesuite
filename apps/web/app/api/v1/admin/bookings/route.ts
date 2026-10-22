import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import { accounts, bookings, db } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { isBookingStatus } from '@/lib/booking-state';
import { presentBooking } from '@/lib/bookings-core';

// Admin-only booking search. Refs are unguessable but this still requires an
// admin session so support can find a booking without knowing its ref.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim().slice(0, 100);
  const status = url.searchParams.get('status');
  const filters: SQL[] = [];

  if (query) {
    const pattern = `%${query}%`;
    const match = or(ilike(bookings.ref, pattern), ilike(accounts.email, pattern));
    if (match) filters.push(match);
  }
  if (status && isBookingStatus(status)) {
    filters.push(eq(bookings.status, status));
  }

  const rows = await db
    .select({
      booking: bookings,
      accountEmail: accounts.email,
      accountName: accounts.name,
    })
    .from(bookings)
    .leftJoin(accounts, eq(bookings.accountId, accounts.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(100);

  return NextResponse.json({
    bookings: rows.map((row) => ({
      ...presentBooking(row.booking),
      accountEmail: row.accountEmail,
      accountName: row.accountName,
    })),
  });
}
