import { NextResponse } from 'next/server';
import { getSessionAccount, type SessionAccount } from '@/lib/auth';

export async function requireAdmin(
  request: Request,
): Promise<{ account: SessionAccount } | { response: NextResponse }> {
  const account = await getSessionAccount(request);
  if (!account) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  if (account.realm !== 'admin') {
    return { response: NextResponse.json({ error: 'Admin only' }, { status: 403 }) };
  }
  return { account };
}
