import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, db, rfqs, rfqQuotes, suppliers } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';
import { traceIdFromRequest } from '@/lib/bookings-core';

const quoteSchema = z.object({
  amountCents: z.number().int().min(1),
  message: z.string().max(5000).optional(),
  traceId: z.string().max(100).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await params;
  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id)).limit(1);
  if (!rfq) {
    return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });
  }
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.accountId, account.id)).limit(1);
  const isSupplier = !!supplier && account.realm === 'supplier';
  if (rfq.accountId !== account.id && !isSupplier && account.realm !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const quotes = await db.select().from(rfqQuotes).where(eq(rfqQuotes.rfqId, id));
  return NextResponse.json({ quotes });
}

// Suppliers quote open RFQs (three-quote model: requester accepts one).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withIdempotency(request, { scope: 'route:POST:/api/v1/rfqs/[id]/quotes', identity: id }, () => handlePost(request, ctx));
}

async function handlePost(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await params;

  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id)).limit(1);
  if (!rfq || rfq.status !== 'open') {
    return NextResponse.json({ error: 'RFQ not open' }, { status: 404 });
  }

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.accountId, account.id)).limit(1);
  if (!supplier || account.realm !== 'supplier') {
    return NextResponse.json({ error: 'Supplier account required' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [quote] = await db
    .insert(rfqQuotes)
    .values({
      rfqId: id,
      supplierId: supplier.id,
      amountCents: parsed.data.amountCents,
      message: parsed.data.message ?? null,
    })
    .returning();
  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: account.realm,
    action: 'rfq.quoted',
    entityType: 'rfq',
    entityId: id,
    diff: { quoteId: quote.id, amountCents: quote.amountCents },
    traceId: traceIdFromRequest(request, parsed.data.traceId),
  });
  return NextResponse.json({ quote }, { status: 201 });
}
