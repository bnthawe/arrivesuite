import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, db, payments, refunds } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';

const requestSchema = z.object({
  paymentId: z.string().uuid(),
  amountCents: z.number().int().min(1),
  reason: z.string().max(500).optional(),
  traceId: z.string().max(100).optional(),
});

// Only non-failed refunds encumber the payment.
async function encumberedTotal(paymentId: string): Promise<number> {
  const rows = await db
    .select({ amountCents: refunds.amountCents, state: refunds.state })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId));
  return rows
    .filter((r) => r.state !== 'failed')
    .reduce((sum, r) => sum + r.amountCents, 0);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);

  const [payment] = await db.select().from(payments).where(eq(payments.id, parsed.data.paymentId)).limit(1);
  if (!payment || payment.status !== 'captured') {
    return NextResponse.json({ error: 'Payment not found or not captured' }, { status: 404 });
  }

  const remaining = payment.amountCents - (await encumberedTotal(payment.id));
  if (parsed.data.amountCents > remaining) {
    return NextResponse.json(
      { error: `Amount exceeds refundable balance of ${remaining}` },
      { status: 409 },
    );
  }

  const [refund] = await db
    .insert(refunds)
    .values({
      paymentId: payment.id,
      amountCents: parsed.data.amountCents,
      reason: parsed.data.reason ?? null,
    })
    .returning();

  await db.insert(auditEvents).values({
    action: 'refund.requested',
    entityType: 'refund',
    entityId: refund.id,
    diff: { paymentId: payment.id, amountCents: refund.amountCents, reason: refund.reason },
    traceId,
  });

  return NextResponse.json({ refund }, { status: 201 });
}

export async function GET(request: Request) {
  const paymentId = new URL(request.url).searchParams.get('paymentId');
  const rows = paymentId
    ? await db.select().from(refunds).where(eq(refunds.paymentId, paymentId))
    : await db.select().from(refunds);
  return NextResponse.json({ refunds: rows });
}
