import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import {
  bookings,
  db,
  paymentIntents,
  payments,
  refunds,
} from '@arrivesuite/db';
import { getSessionAccount } from '@/lib/auth';
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

  // Auth before any DB work. Non-admins may only request refunds against
  // payments on their own bookings.
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (account.realm !== 'admin') {
    const [owned] = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
      .innerJoin(bookings, eq(bookings.id, paymentIntents.bookingId))
      .where(and(eq(payments.id, parsed.data.paymentId), eq(bookings.accountId, account.id)))
      .limit(1);
    if (!owned) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }
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
  const account = await getSessionAccount(request);
  if (!account) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get('paymentId');

  if (account.realm === 'admin') {
    const rows = paymentId
      ? await db.select().from(refunds).where(eq(refunds.paymentId, paymentId))
      : await db.select().from(refunds);
    return NextResponse.json({ refunds: rows });
  }

  // Non-admin: only refunds against payments on their own bookings.
  const scoped = await db
    .select({ refund: refunds })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
    .innerJoin(bookings, eq(bookings.id, paymentIntents.bookingId))
    .where(
      paymentId
        ? and(eq(bookings.accountId, account.id), eq(refunds.paymentId, paymentId))
        : eq(bookings.accountId, account.id),
    );
  return NextResponse.json({ refunds: scoped.map((row) => row.refund) });
}
