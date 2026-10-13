import { NextResponse } from 'next/server';
import { getSessionAccount } from '@/lib/auth';
import { agencyCredit, isAgencyMember } from '@/lib/agencies';

// Agency members see their own credit; admins see any agency's.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await params;
  if (account.realm !== 'admin' && !(await isAgencyMember(id, account.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const credit = await agencyCredit(id);
  if (!credit) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }
  return NextResponse.json({ credit });
}
