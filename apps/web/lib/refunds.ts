import { eq } from 'drizzle-orm';
import { auditEvents, db, payments, refunds } from '@arrivesuite/db';

export type CreatedRefund = typeof refunds.$inferSelect;

export type CreateRefundResult =
  | { ok: true; refund: CreatedRefund }
  | { ok: false; status: number; error: string };

// Shared by the public refund endpoint and admin cancellation. The payment row
// is locked while the remaining balance is calculated, so concurrent requests
// with different idempotency keys serialize instead of both passing the check.
export async function createRefundRequest(input: {
  paymentId: string;
  amountCents: number;
  reason?: string;
  traceId: string;
  actorId?: string;
  actorRealm?: 'admin' | 'supplier' | 'agent' | 'customer';
}): Promise<CreateRefundResult> {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.paymentId))
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
      .filter((row) => row.state !== 'failed')
      .reduce((sum, row) => sum + row.amountCents, 0);
    const remaining = payment.amountCents - encumbered;
    if (input.amountCents > remaining) {
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
        amountCents: input.amountCents,
        reason: input.reason ?? null,
      })
      .returning();

    await tx.insert(auditEvents).values({
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.actorRealm ? { actorRealm: input.actorRealm } : {}),
      action: 'refund.requested',
      entityType: 'refund',
      entityId: refund.id,
      diff: {
        paymentId: payment.id,
        amountCents: refund.amountCents,
        reason: refund.reason,
        ...(input.actorId ? { requestedBy: input.actorId } : {}),
      },
      traceId: input.traceId,
    });

    return { ok: true as const, refund };
  });
}
