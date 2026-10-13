import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, ledgerEntries, paymentIntents, payments, refunds } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';
import { bookingRevenueLines, invertLines, postLedgerLines } from '@/lib/ledger';
import { traceIdFromRequest } from '@/lib/bookings-core';

const repairSchema = z.object({
  type: z.enum(['payment', 'refund']),
  id: z.string().uuid(),
  traceId: z.string().max(100).optional(),
});

// Backfills ledger entries missed by best-effort posting. Idempotent:
// does nothing when entries already exist for the reference.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = repairSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);

  if (parsed.data.type === 'payment') {
    const [payment] = await db.select().from(payments).where(eq(payments.id, parsed.data.id)).limit(1);
    if (!payment || payment.status !== 'captured') {
      return NextResponse.json({ error: 'Payment not found or not captured' }, { status: 404 });
    }
    const existing = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.referenceId, payment.id))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ ok: true, replayed: true });
    }
    const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, payment.intentId)).limit(1);
    if (!intent) {
      return NextResponse.json({ error: 'Intent missing' }, { status: 409 });
    }
    const revenueLines = await bookingRevenueLines(intent.bookingId);
    await postLedgerLines([
      {
        account: `cash:${intent.method}`,
        direction: 'debit',
        amountCents: payment.amountCents,
        currency: payment.currency,
        referenceType: 'payment',
        referenceId: payment.id,
      },
      ...revenueLines.map((l) => ({ ...l, referenceType: 'payment', referenceId: payment.id })),
    ]);
    void traceId;
    return NextResponse.json({ ok: true });
  }

  const [refund] = await db.select().from(refunds).where(eq(refunds.id, parsed.data.id)).limit(1);
  if (!refund || refund.state !== 'completed') {
    return NextResponse.json({ error: 'Refund not found or not completed' }, { status: 404 });
  }
  const existing = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.referenceId, refund.id))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ ok: true, replayed: true });
  }
  const [payment] = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  const [intent] = payment
    ? await db.select().from(paymentIntents).where(eq(paymentIntents.id, payment.intentId)).limit(1)
    : [];
  if (!payment || !intent) {
    return NextResponse.json({ error: 'Payment intent missing' }, { status: 409 });
  }
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
  return NextResponse.json({ ok: true });
}
