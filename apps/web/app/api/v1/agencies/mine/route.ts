import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { agencyUsers, agencies, db } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';

// Agencies the signed-in account belongs to.
export async function GET(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const memberships = await db
    .select()
    .from(agencyUsers)
    .where(eq(agencyUsers.accountId, account.id));
  if (memberships.length === 0) {
    return NextResponse.json({ agencies: [] });
  }
  const rows = await db
    .select()
    .from(agencies)
    .where(inArray(agencies.id, memberships.map((m) => m.agencyId)));
  return NextResponse.json({ agencies: rows });
}
