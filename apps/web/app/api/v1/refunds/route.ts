import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, refunds } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { createRefundRequest } from '@/lib/refunds';

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

  const result = await createRefundRequest({
    paymentId: parsed.data.paymentId,
    amountCents: parsed.data.amountCents,
    reason: parsed.data.reason,
    traceId,
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
