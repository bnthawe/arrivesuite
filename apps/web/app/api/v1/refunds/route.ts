import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auditEvents, db, payments, refunds } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';

const requestSchema = z.object({
  paymentId: z.string().uuid(),
  amountCents: z.number().int().min(1),
  reason: z.string().max(500).optional(),
  traceId: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'refunds.create', audit: false }, () => handlePost(request));
}

async function handlePost(request: Request) {
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

  // Lock the payment row while calculating the remaining balance. Concurrent
  // refund requests with different idempotency keys serialize here instead of
  // both passing the balance check.
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, parsed.data.paymentId))
      .limit(1)
      .for('update');
    if (!payment || payment.status !== 'captured') {
      return { ok: false as const, status: 404, error: 'Payment not found or not captured' };
    }

    const rows = await tx
      .select({ amountCents: refunds.amountCents, state: refunds.state })
      .from(refunds)
      .where(eq(refunds.paymentId, payment.id));
    const encumbered = rows
      .filter((r) => r.state !== 'failed')
      .reduce((sum, r) => sum + r.amountCents, 0);
    const remaining = payment.amountCents - encumbered;
    if (parsed.data.amountCents > remaining) {
      return {
        ok: false as const,
        status: 409,
        error: `Amount exceeds refundable balance of ${remaining}`,
      };
    }

    const [refund] = await tx
      .insert(refunds)
      .values({
        paymentId: payment.id,
        amountCents: parsed.data.amountCents,
        reason: parsed.data.reason ?? null,
      })
      .returning();

    await tx.insert(auditEvents).values({
      action: 'refund.requested',
      entityType: 'refund',
      entityId: refund.id,
      diff: { paymentId: payment.id, amountCents: refund.amountCents, reason: refund.reason },
      traceId,
    });

    return { ok: true as const, refund };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ refund: result.refund }, { status: 201 });
}

export async function GET(request: Request) {
  const paymentId = new URL(request.url).searchParams.get('paymentId');
  const rows = paymentId
    ? await db.select().from(refunds).where(eq(refunds.paymentId, paymentId))
    : await db.select().from(refunds);
  return NextResponse.json({ refunds: rows });
}
