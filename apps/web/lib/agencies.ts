import { and, eq, inArray, sql } from 'drizzle-orm';
import { accounts, agencies, agencyUsers, bookings, db } from '@arrivesuite/db';

export interface AgencyCredit {
  agencyId: string;
  limitCents: number;
  outstandingCents: number;
  availableCents: number;
}

// Outstanding = unpaid, unrefunded totals across all agency member bookings.
export async function agencyCredit(agencyId: string): Promise<AgencyCredit | null> {
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!agency) return null;

  const members = await db
    .select({ accountId: agencyUsers.accountId })
    .from(agencyUsers)
    .where(eq(agencyUsers.agencyId, agencyId));
  const ids = members.map((m) => m.accountId);
  let outstandingCents = 0;
  if (ids.length > 0) {
    const rows = await db
      .select({ owing: sql<number>`coalesce(sum(${bookings.totalCents} - ${bookings.paidCents} - ${bookings.refundedCents}), 0)` })
      .from(bookings)
      .where(inArray(bookings.accountId, ids));
    outstandingCents = Number(rows[0]?.owing ?? 0);
  }
  return {
    agencyId,
    limitCents: agency.creditLimitCents,
    outstandingCents,
    availableCents: agency.creditLimitCents - outstandingCents,
  };
}

export async function isAgencyMember(agencyId: string, accountId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(agencyUsers)
    .where(and(eq(agencyUsers.agencyId, agencyId), eq(agencyUsers.accountId, accountId)))
    .limit(1);
  return rows.length > 0;
}

export async function isAgentAccount(accountId: string): Promise<boolean> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  return !!account && !account.deletedAt && account.realm === 'agent';
}
