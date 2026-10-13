import { NextResponse } from 'next/server';
import { getSessionAccount } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { db, suppliers } from '@arrivesuite/db';

// Resolves the caller's supplier profile. Drafts allowed while prospect;
// publishing gates on active status at the route level.
export async function requireSupplier(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (account.realm !== 'supplier') {
    return { response: NextResponse.json({ error: 'Supplier account required' }, { status: 403 }) };
  }
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.accountId, account.id)).limit(1);
  if (!supplier || supplier.deletedAt) {
    return { response: NextResponse.json({ error: 'No supplier profile yet — onboard first' }, { status: 404 }) };
  }
  return { account, supplier };
}
