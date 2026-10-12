import { eq } from 'drizzle-orm';
import { db, accounts, sessions, hashSessionToken } from '@arrivesuite/db';

export const SESSION_COOKIE = 'as_session';
// FR-5.5.2: 8-hour sessions.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export interface SessionAccount {
  id: string;
  email: string;
  realm: 'admin' | 'supplier' | 'agent' | 'customer';
  name: string | null;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

// Returns the account for a valid, unexpired session and slides the expiry
// forward (refresh on activity, FR-5.5.2). Null when signed out/expired.
export async function getSessionAccount(request: Request): Promise<SessionAccount | null> {
  const token = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!token) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .limit(1);
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  const [account] = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);
  if (!account || account.deletedAt) return null;

  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
    .where(eq(sessions.id, session.id));

  return { id: account.id, email: account.email, realm: account.realm, name: account.name };
}
