import { eq, sql } from 'drizzle-orm';
import { auditEvents, bookings, db, paymentIntents, payments } from '@arrivesuite/db';
import { bookingRevenueLines, postLedgerLines } from './ledger';

export interface CaptureInput {
  providerRef: string;
  amountCents: number;
  currency: string;
  providerPaymentId: string | null;
  traceId: string;
}

export type CaptureResult =
  | { ok: true; paymentId: string; replayed: boolean }
  | { ok: false; status: number; error: string };

// Single capture path for Paystack webhooks and DPO return verification.
// providerRef is the idempotency key: duplicate deliveries replay.
export async function capturePaymentByProviderRef(input: CaptureInput): Promise<CaptureResult> {
  const [intent] = await db
    .select()
    .from(paymentIntents)
    .where(eq(paymentIntents.providerRef, input.providerRef))
    .limit(1);
  if (!intent) {
    await db.insert(auditEvents).values({
      action: 'payment.webhook_unmatched',
      entityType: 'payment',
      entityId: input.providerRef,
      diff: { amount: input.amountCents },
      traceId: input.traceId,
    });
    return { ok: false, status: 404, error: 'Unknown payment reference' };
  }

  if (intent.state === 'captured') {
    return { ok: true, paymentId: '', replayed: true };
  }
  if (intent.expiresAt.getTime() <= Date.now()) {
    await db.update(paymentIntents).set({ state: 'expired' }).where(eq(paymentIntents.id, intent.id));
    return { ok: false, status: 410, error: 'Payment intent expired' };
  }
  if (input.amountCents !== intent.amountCents) {
    await db.insert(auditEvents).values({
      action: 'payment.amount_mismatch',
      entityType: 'payment_intent',
      entityId: intent.id,
      diff: { expected: intent.amountCents, received: input.amountCents },
      traceId: input.traceId,
    });
    return { ok: false, status: 409, error: 'Amount mismatch' };
  }

  const [payment] = await db
    .insert(payments)
    .values({
      intentId: intent.id,
      providerPaymentId: input.providerPaymentId,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      status: 'captured',
      capturedAt: new Date(),
    })
    .returning();

  await db.update(paymentIntents).set({ state: 'captured' }).where(eq(paymentIntents.id, intent.id));
  await db
    .update(bookings)
    .set({ paidCents: sql`${bookings.paidCents} + ${input.amountCents}` })
    .where(eq(bookings.id, intent.bookingId));

  await db.insert(auditEvents).values({
    action: 'payment.captured',
    entityType: 'payment',
    entityId: payment.id,
    diff: {
      intentId: intent.id,
      bookingId: intent.bookingId,
      method: intent.method,
      reference: input.providerRef,
      amount: input.amountCents,
      currency: input.currency,
    },
    traceId: input.traceId,
  });

  // Double-entry posting: Dr cash, Cr revenue/payable (ADR-0017). Failure
  // is audited, never blocks capture; repair via POST /api/v1/admin/ledger/repair.
  try {
    const revenueLines = await bookingRevenueLines(intent.bookingId);
    await postLedgerLines([
      {
        account: `cash:${intent.method}`,
        direction: 'debit',
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        referenceType: 'payment',
        referenceId: payment.id,
      },
      ...revenueLines.map((l) => ({ ...l, referenceType: 'payment', referenceId: payment.id })),
    ]);
  } catch (err) {
    await db.insert(auditEvents).values({
      action: 'payment.ledger_missing',
      entityType: 'payment',
      entityId: payment.id,
      diff: { error: (err as Error)?.message ?? 'posting failed' },
      traceId: input.traceId,
    });
  }

  return { ok: true, paymentId: payment.id, replayed: false };
}
