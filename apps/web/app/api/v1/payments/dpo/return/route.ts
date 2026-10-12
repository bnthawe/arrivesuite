import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { verifyDpoToken } from '@arrivesuite/integrations';
import { db, paymentIntents } from '@arrivesuite/db';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { capturePaymentByProviderRef } from '@/lib/payments-capture';

const returnSchema = z.object({
  TransToken: z.string().min(1).optional(),
  TransactionToken: z.string().min(1).optional(),
  CompanyRef: z.string().min(1).optional(),
});

// DPO redirects here after hosted-page payment with TransToken + CompanyRef.
// verifyToken confirms paid status (docs: verify within 30 min), then the
// shared capture path records it — same idempotency as webhooks.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = returnSchema.safeParse({
    TransToken: url.searchParams.get('TransToken') ?? undefined,
    TransactionToken: url.searchParams.get('TransactionToken') ?? undefined,
    CompanyRef: url.searchParams.get('CompanyRef') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const transToken = parsed.data.TransToken ?? parsed.data.TransactionToken;
  if (!transToken) {
    return NextResponse.json({ error: 'Transaction token required' }, { status: 400 });
  }

  const traceId = traceIdFromRequest(request);
  const verification = await verifyDpoToken(transToken);
  if (!verification.paid) {
    return NextResponse.json(
      { ok: false, status: verification.resultExplanation || 'Not paid' },
      { status: 402 },
    );
  }

  // Live verifyToken carries the paid amount; sandbox does not, so the
  // intent's expected amount applies (capture still enforces equality).
  let amountCents: number;
  let currency: string;
  if (verification.amountMajor) {
    amountCents = Math.round(parseFloat(verification.amountMajor) * 100);
    currency = verification.currency ?? 'BWP';
  } else {
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.providerRef, transToken))
      .limit(1);
    if (!intent) {
      return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
    }
    amountCents = intent.amountCents;
    currency = intent.currency;
  }
  const result = await capturePaymentByProviderRef({
    providerRef: transToken,
    amountCents,
    currency,
    providerPaymentId: verification.approval ?? null,
    traceId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, paymentId: result.paymentId || undefined, replayed: result.replayed || undefined });
}
