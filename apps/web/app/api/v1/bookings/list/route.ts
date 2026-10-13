import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { bookings, db } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';
import { presentBooking } from '@/lib/bookings-core';

// Own bookings for the signed-in account; admins may pass ?all=1.
export async function GET(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const all = new URL(request.url).searchParams.get('all') === '1';
  if (all && account.realm !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const rows = all
    ? await db.select().from(bookings).orderBy(desc(bookings.createdAt)).limit(100)
    : await db
        .select()
        .from(bookings)
        .where(eq(bookings.accountId, account.id))
        .orderBy(desc(bookings.createdAt))
        .limit(100);
  return NextResponse.json({ bookings: rows.map(presentBooking) });
}
