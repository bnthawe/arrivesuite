import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateSessionToken, hashSessionToken } from '@arrivesuite/db';
import { db, sessions, accounts } from '@arrivesuite/db';
import { eq } from 'drizzle-orm';
import { verifyOtp } from '@/lib/whatsapp-otp';
import { SESSION_TTL_MS, sessionCookieHeader } from '@/lib/auth';
import { withIdempotency } from '@/lib/idempotency';

const verifySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'auth.whatsapp-otp.verify', audit: false }, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
    }

    const result = await verifyOtp(parsed.data.phone, parsed.data.code);
    if (!result.ok || !result.accountId) {
      return NextResponse.json({ error: result.error ?? 'Verification failed' }, { status: 401 });
    }

    const [account] = await db.select().from(accounts).where(eq(accounts.id, result.accountId)).limit(1);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Create session
    const token = generateSessionToken();
    await db.insert(sessions).values({
      accountId: account.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    return NextResponse.json(
      { ok: true, account: { id: account.id, email: account.email, realm: account.realm, name: account.name } },
      { headers: { 'Set-Cookie': sessionCookieHeader(token) } },
    );
  });
}