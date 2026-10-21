import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { accounts, auditEvents, bookings, db, paymentIntents, payments, refunds } from '@arrivesuite/db';
import { createPaystackRefund, refundDpoToken, refundFlutterwaveTransaction, refundStripePayment } from '@arrivesuite/integrations';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { bookingRevenueLines, invertLines, postLedgerLines } from '@/lib/ledger';
import { withIdempotency } from '@/lib/idempotency';

const approveSchema = z.object({
  approvedBy: z.string().uuid(),
  traceId: z.string().max(100).optional(),
});

// Approve executes the provider refund immediately: pending → approved →
// completed/failed, with bookings.refundedCents updated on success.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withIdempotency(request, { scope: 'refunds.approve', identity: id, audit: false }, () =>
    handlePost(request, ctx),
  );
}

async function handlePost(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);

  const [approver] = await db.select().from(accounts).where(eq(accounts.id, parsed.data.approvedBy)).limit(1);
  if (!approver || approver.deletedAt || approver.realm !== 'admin') {
    return NextResponse.json({ error: 'Approver must be an active admin account' }, { status: 403 });
  }

  const [refund] = await db.select().from(refunds).where(eq(refunds.id, id)).limit(1);
  if (!refund) {
    return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
  }
  if (refund.state !== 'pending') {
    return NextResponse.json({ error: `Refund already ${refund.state}` }, { status: 409 });
  }

  const [payment] = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  const [intent] = payment
    ? await db.select().from(paymentIntents).where(eq(paymentIntents.id, payment.intentId)).limit(1)
    : [];
  if (!payment || !intent) {
    return NextResponse.json({ error: 'Payment intent missing' }, { status: 409 });
  }

  // Atomically claim the pending refund. Concurrent approvals (even with
  // different idempotency keys) cannot both reach the provider call.
  const [claimed] = await db
    .update(refunds)
    .set({ state: 'approved', approvedBy: approver.id })
    .where(and(eq(refunds.id, refund.id), eq(refunds.state, 'pending')))
    .returning();
  if (!claimed) {
    return NextResponse.json({ error: 'Refund is already being processed' }, { status: 409 });
  }

  try {
    if (intent.method === 'dpo') {
      await refundDpoToken({
        transToken: intent.providerRef ?? '',
        amountMajor: (refund.amountCents / 100).toFixed(2),
        details: refund.reason ?? `Refund for booking payment ${payment.id}`,
        refundRef: refund.id,
      });
    } else if (intent.method === 'flutterwave') {
      const txId = payment.providerPaymentId ? Number(payment.providerPaymentId) : NaN;
      if (!Number.isFinite(txId)) throw new Error('missing Flutterwave transaction id');
      await refundFlutterwaveTransaction(txId, (refund.amountCents / 100).toFixed(2));
    } else if (intent.method === 'stripe') {
      if (!payment.providerPaymentId) throw new Error('missing Stripe payment id');
      await refundStripePayment(payment.providerPaymentId, refund.amountCents);
    } else {
      await createPaystackRefund({
        transaction: intent.providerRef ?? '',
        amountMinor: refund.amountCents,
      });
    }
  } catch (err) {
    await db.update(refunds).set({ state: 'failed' }).where(eq(refunds.id, refund.id));
    await db.insert(auditEvents).values({
      actorId: approver.id,
      actorRealm: 'admin',
      action: 'refund.failed',
      entityType: 'refund',
      entityId: refund.id,
      diff: { error: (err as Error)?.message ?? 'provider error' },
      traceId,
    });
    return NextResponse.json({ error: 'Provider refund failed' }, { status: 502 });
  }

  await db.update(refunds).set({ state: 'completed' }).where(eq(refunds.id, refund.id));
  await db
    .update(bookings)
    .set({ refundedCents: sql`${bookings.refundedCents} + ${refund.amountCents}` })
    .where(eq(bookings.id, intent.bookingId));

  // Mirror posting pro-rata: reverse the revenue split, credit cash back.
  // Best-effort like capture; repair endpoint backfills on failure.
  try {
    const revenueLines = await bookingRevenueLines(intent.bookingId);
    const ratio = refund.amountCents / Math.max(1, intent.amountCents);
    const mirrored = invertLines(revenueLines, 'refund', refund.id).map((l) => ({
      ...l,
      amountCents: Math.round(l.amountCents * ratio),
    }));
    const mirroredTotal = mirrored.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amountCents, 0);
    await postLedgerLines([
      ...mirrored,
      {
        account: `cash:${intent.method}`,
        direction: 'credit' as const,
        amountCents: mirroredTotal,
        currency: payment.currency,
        referenceType: 'refund',
        referenceId: refund.id,
      },
    ]);
  } catch (err) {
    await db.insert(auditEvents).values({
      actorId: approver.id,
      actorRealm: 'admin',
      action: 'refund.ledger_missing',
      entityType: 'refund',
      entityId: refund.id,
      diff: { error: (err as Error)?.message ?? 'posting failed' },
      traceId,
    });
  }
  await db.insert(auditEvents).values({
    actorId: approver.id,
    actorRealm: 'admin',
    action: 'refund.completed',
    entityType: 'refund',
    entityId: refund.id,
    diff: { paymentId: payment.id, bookingId: intent.bookingId, amountCents: refund.amountCents, method: intent.method },
    traceId,
  });

  const [completed] = await db.select().from(refunds).where(eq(refunds.id, refund.id)).limit(1);
  return NextResponse.json({ refund: completed });
}
