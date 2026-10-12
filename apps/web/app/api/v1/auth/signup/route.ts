import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  auditEvents,
  accounts,
  db,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  sessions,
} from '@arrivesuite/db';
import { SESSION_TTL_MS, sessionCookieHeader } from '@/lib/auth';

const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Phase 0 serves the customer realm only; the realm never comes from the client.
  const email = parsed.data.email.toLowerCase();
  const existing = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const [account] = await db
    .insert(accounts)
    .values({
      email,
      passwordHash: await hashPassword(parsed.data.password),
      realm: 'customer',
      name: parsed.data.name ?? null,
    })
    .returning();

  const token = generateSessionToken();
  await db.insert(sessions).values({
    accountId: account.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: 'customer',
    action: 'auth.signup',
    entityType: 'account',
    entityId: account.id,
  });

  return NextResponse.json(
    {
      account: { id: account.id, email: account.email, realm: account.realm, name: account.name },
    },
    { status: 201, headers: { 'Set-Cookie': sessionCookieHeader(token) } },
  );
}
