import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import {
  accounts,
  alertStates,
  auditEvents,
  bookingGuests,
  bookingItems,
  bookings,
  db,
  ledgerAccounts,
  ledgerEntries,
  paymentIntents,
  payments,
  refunds,
} from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { presentBooking } from '@/lib/bookings-core';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  const { ref } = await params;
  const normalized = ref.trim();
  const [found] = await db
    .select({
      booking: bookings,
      accountEmail: accounts.email,
      accountName: accounts.name,
    })
    .from(bookings)
    .leftJoin(accounts, eq(bookings.accountId, accounts.id))
    .where(eq(bookings.ref, normalized))
    .limit(1);
  if (!found) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const bookingId = found.booking.id;
  const [items, guestRows, intents, alerts] = await Promise.all([
    db
      .select()
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(bookingItems.createdAt),
    db
      .select()
      .from(bookingGuests)
      .where(eq(bookingGuests.bookingId, bookingId))
      .orderBy(bookingGuests.createdAt),
    db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.bookingId, bookingId))
      .orderBy(desc(paymentIntents.createdAt)),
    db
      .select()
      .from(alertStates)
      .where(eq(alertStates.reference, normalized))
      .orderBy(desc(alertStates.firstSeenAt)),
  ]);

  const itemIds = items.map((item) => item.id);
  const intentIds = intents.map((intent) => intent.id);
  const paymentRows =
    intentIds.length > 0
      ? await db
          .select()
          .from(payments)
          .where(inArray(payments.intentId, intentIds))
          .orderBy(desc(payments.createdAt))
      : [];
  const paymentIds = paymentRows.map((payment) => payment.id);
  const refundRows =
    paymentIds.length > 0
      ? await db
          .select()
          .from(refunds)
          .where(inArray(refunds.paymentId, paymentIds))
          .orderBy(desc(refunds.createdAt))
      : [];
  const refundIds = refundRows.map((refund) => refund.id);

  const ledgerRows = await db
    .select({
      entry: ledgerEntries,
      accountName: ledgerAccounts.name,
    })
    .from(ledgerEntries)
    .leftJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
    .where(inArray(ledgerEntries.referenceId, [bookingId, ...paymentIds, ...refundIds]))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(300);

  const auditRows = await db
    .select()
    .from(auditEvents)
    .where(
      inArray(auditEvents.entityId, [
        bookingId,
        ...itemIds,
        ...intentIds,
        ...paymentIds,
        ...refundIds,
      ]),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(300);

  // Support needs enough passenger data to resolve a ticketing failure, but
  // passport numbers are still masked in the admin response.
  const guests = guestRows.map((guest) => ({
    ...guest,
    passportNumber: undefined,
    passportHint: guest.passportNumber
      ? `${guest.passportNumber.slice(0, 2)}••••${guest.passportNumber.slice(-2)}`
      : null,
  }));

  return NextResponse.json({
    booking: presentBooking(found.booking),
    account: {
      email: found.accountEmail,
      name: found.accountName,
    },
    items,
    guests,
    intents,
    payments: paymentRows,
    refunds: refundRows,
    ledger: ledgerRows.map((row) => ({
      ...row.entry,
      accountName: row.accountName,
    })),
    audit: auditRows,
    alerts,
  });
}
