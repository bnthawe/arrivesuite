import { NextResponse } from 'next/server';
import { getSessionAccount } from '@/lib/auth';

export async function GET(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({ account });
}
