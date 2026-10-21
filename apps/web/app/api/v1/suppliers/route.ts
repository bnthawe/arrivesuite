import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, db, suppliers } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';
import { traceIdFromRequest } from '@/lib/bookings-core';

const onboardSchema = z.object({
  legalName: z.string().min(1).max(500),
  tradingName: z.string().min(1).max(500).optional(),
  traceId: z.string().max(100).optional(),
});

// Supplier self-onboarding: one profile per supplier-realm account,
// starting at prospect for the admin approval funnel.
export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'route:POST:/api/v1/suppliers', audit: false }, () => handlePost(request));
}

async function handlePost(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (account.realm !== 'supplier') {
    return NextResponse.json({ error: 'Supplier account required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = onboardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);

  const [existing] = await db.select().from(suppliers).where(eq(suppliers.accountId, account.id)).limit(1);
  if (existing) {
    return NextResponse.json({ supplier: existing, replayed: true });
  }

  const [supplier] = await db
    .insert(suppliers)
    .values({
      accountId: account.id,
      legalName: parsed.data.legalName,
      tradingName: parsed.data.tradingName ?? null,
    })
    .returning();

  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: 'supplier',
    action: 'supplier.onboarded',
    entityType: 'supplier',
    entityId: supplier.id,
    diff: { legalName: supplier.legalName, status: supplier.status },
    traceId,
  });

  return NextResponse.json({ supplier }, { status: 201 });
}

export async function GET(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (account.realm !== 'supplier' && account.realm !== 'admin') {
    return NextResponse.json({ error: 'Supplier account required' }, { status: 403 });
  }
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.accountId, account.id)).limit(1);
  if (!supplier) {
    return NextResponse.json({ error: 'No supplier profile yet' }, { status: 404 });
  }
  return NextResponse.json({ supplier });
}
