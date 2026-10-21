import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auditEvents, db, hashSessionToken, sessions } from '@arrivesuite/db';
import { SESSION_COOKIE, clearSessionCookieHeader, getSessionAccount } from '@/lib/auth';

function readToken(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx >= 0 && part.slice(0, idx).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export async function POST(request: Request) {
  // Resolve the actor before deleting the session so the audit row can name it.
  const account = await getSessionAccount(request);
  const token = readToken(request);
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }
  if (account) {
    try {
      await db.insert(auditEvents).values({
        actorId: account.id,
        actorRealm: account.realm,
        action: 'auth.logout',
        entityType: 'account',
        entityId: account.id,
        traceId: request.headers.get(process.env.TRACE_ID_HEADER ?? 'x-trace-id')?.slice(0, 100) ?? null,
      });
    } catch (err) {
      console.error('[auth] could not audit logout:', err);
    }
  }
  return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}
