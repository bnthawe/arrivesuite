import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, hashSessionToken, sessions } from '@arrivesuite/db';
import { SESSION_COOKIE, clearSessionCookieHeader } from '@/lib/auth';

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
  const token = readToken(request);
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }
  return NextResponse.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookieHeader() } });
}
