import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { accounts, auditEvents, bookings, db, paymentIntents, payments, refunds } from '@arrivesuite/db';
import { createPaystackRefund, refundDpoToken, refundFlutterwaveTransaction, refundStripePayment } from '@arrivesuite/integrations';
import { traceIdFromRequest } from '@/lib/bookings-core';

const approveSchema = z.object({
  approvedBy: z.string().uuid(),
  traceId: z.string().max(100).optional(),
});

// Approve executes the provider refund immediately: pending → approved →
// completed/failed, with bookings.refundedCents updated on success.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  await db
    .update(refunds)
    .set({ state: 'approved', approvedBy: approver.id })
    .where(eq(refunds.id, refund.id));

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
