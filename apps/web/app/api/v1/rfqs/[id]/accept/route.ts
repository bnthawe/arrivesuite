import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, db, rfqs, rfqQuotes } from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';
import { traceIdFromRequest } from '@/lib/bookings-core';

const acceptSchema = z.object({
  quoteId: z.string().uuid(),
  traceId: z.string().max(100).optional(),
});

// Only the requester accepts, exactly one quote wins, the rest decline.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [rfq] = await db.select().from(rfqs).where(eq(rfqs.id, id)).limit(1);
  if (!rfq || rfq.status !== 'open') {
    return NextResponse.json({ error: 'RFQ not open' }, { status: 404 });
  }
  if (rfq.accountId !== account.id) {
    return NextResponse.json({ error: 'Only the requester accepts' }, { status: 403 });
  }

  const [quote] = await db.select().from(rfqQuotes).where(eq(rfqQuotes.id, parsed.data.quoteId)).limit(1);
  if (!quote || quote.rfqId !== id || quote.state !== 'submitted') {
    return NextResponse.json({ error: 'Quote not available' }, { status: 409 });
  }

  await db.update(rfqQuotes).set({ state: 'accepted' }).where(eq(rfqQuotes.id, quote.id));
  const others = await db.select().from(rfqQuotes).where(eq(rfqQuotes.rfqId, id));
  for (const other of others) {
    if (other.id !== quote.id && other.state === 'submitted') {
      await db.update(rfqQuotes).set({ state: 'declined' }).where(eq(rfqQuotes.id, other.id));
    }
  }
  await db.update(rfqs).set({ status: 'accepted' }).where(eq(rfqs.id, id));
  await db.insert(auditEvents).values({
    actorId: account.id,
    actorRealm: account.realm,
    action: 'rfq.accepted',
    entityType: 'rfq',
    entityId: id,
    diff: { quoteId: quote.id, amountCents: quote.amountCents },
    traceId: traceIdFromRequest(request, parsed.data.traceId),
  });
  return NextResponse.json({ ok: true });
}
