import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { bookingItems, bookings, db, ledgerAccounts, ledgerEntries } from '@arrivesuite/db';

export interface LedgerLine {
  account: string;
  direction: 'debit' | 'credit';
  amountCents: number;
  currency: string;
  referenceType: string;
  referenceId: string;
  note?: string;
}

// Posts a balanced batch: sum(debits) must equal sum(credits).
export async function postLedgerLines(lines: LedgerLine[], transactionId = randomUUID()): Promise<string> {
  const debits = lines.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amountCents, 0);
  const credits = lines.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amountCents, 0);
  if (debits !== credits || debits <= 0) {
    throw new Error(`Unbalanced ledger batch: debit ${debits} vs credit ${credits}`);
  }
  const txUuid = transactionId;

  await db.transaction(async (trx) => {
    for (const line of lines) {
      const [account] = await trx.select().from(ledgerAccounts).where(eq(ledgerAccounts.name, line.account)).limit(1);
      if (!account) throw new Error(`Unknown ledger account: ${line.account}`);
      await trx.insert(ledgerEntries).values({
        transactionId: txUuid,
        accountId: account.id,
        direction: line.direction,
        amountCents: line.amountCents,
        currency: line.currency,
        referenceType: line.referenceType,
        referenceId: line.referenceId,
        note: line.note ?? null,
      });
    }
  });
  return txUuid;
}

// Mirrors a posting (refunds): debits become credits and vice versa.
export function invertLines(lines: LedgerLine[], referenceType: string, referenceId: string): LedgerLine[] {
  return lines.map((l) => ({
    ...l,
    direction: l.direction === 'debit' ? ('credit' as const) : ('debit' as const),
    referenceType,
    referenceId,
  }));
}

// ADR-0017 revenue split for one booking: owned items gross to
// revenue:owned; sourced items split into commission + supplier payable.
export async function bookingRevenueLines(bookingId: string): Promise<LedgerLine[]> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) throw new Error('Unknown booking');
  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, bookingId));

  const ownedGross = items.filter((i) => i.itemSupplierType === 'owned').reduce((s, i) => s + i.totalCents, 0);
  const sourced = items.filter((i) => i.itemSupplierType !== 'owned');
  const commission = sourced.reduce((s, i) => s + i.markupCents + i.taxCents, 0);
  const payable = sourced.reduce((s, i) => s + i.netCents, 0);

  const lines: LedgerLine[] = [];
  if (ownedGross > 0) {
    lines.push({ account: 'revenue:owned', direction: 'credit', amountCents: ownedGross, currency: booking.currency, referenceType: 'booking', referenceId: booking.id });
  }
  if (commission > 0) {
    lines.push({ account: 'revenue:commission', direction: 'credit', amountCents: commission, currency: booking.currency, referenceType: 'booking', referenceId: booking.id });
  }
  if (payable > 0) {
    lines.push({ account: 'supplier_payable', direction: 'credit', amountCents: payable, currency: booking.currency, referenceType: 'booking', referenceId: booking.id });
  }
  return lines;
}
