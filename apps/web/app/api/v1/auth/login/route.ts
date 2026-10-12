import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  auditEvents,
  accounts,
  db,
  generateSessionToken,
  hashSessionToken,
  sessions,
  verifyPassword,
} from '@arrivesuite/db';
import { SESSION_TTL_MS, sessionCookieHeader } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);

  // Generic message in both branches to avoid account enumeration.
  if (!account || account.deletedAt) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (!(await verifyPassword(account.passwordHash, parsed.data.password))) {
    await db.insert(auditEvents).values({
      actorId: account.id,
      actorRealm: account.realm,
      action: 'auth.login_failed',
      entityType: 'account',
      entityId: account.id,
    });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = generateSessionToken();
  await db.insert(sessions).values({
    accountId: account.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: account.realm,
    action: 'auth.login',
    entityType: 'account',
    entityId: account.id,
  });

  return NextResponse.json(
    {
      account: { id: account.id, email: account.email, realm: account.realm, name: account.name },
    },
    { headers: { 'Set-Cookie': sessionCookieHeader(token) } },
  );
}
