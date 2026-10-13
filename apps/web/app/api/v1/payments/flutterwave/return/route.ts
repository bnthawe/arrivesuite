import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyFlutterwaveTransaction } from '@arrivesuite/integrations';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { capturePaymentByProviderRef } from '@/lib/payments-capture';

const returnSchema = z.object({
  tx_id: z.string().min(1),
  ref: z.string().min(1).optional(),
});

// Flutterwave redirects here after hosted payment. verifyTransaction
// confirms paid status, then the shared capture path records it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = returnSchema.safeParse({
    tx_id: url.searchParams.get('tx_id') ?? undefined,
    ref: url.searchParams.get('ref') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const traceId = traceIdFromRequest(request);
  const verification = await verifyFlutterwaveTransaction(Number(parsed.data.tx_id));
  if (verification.status !== 'successful') {
    return NextResponse.json({ ok: false, status: verification.status }, { status: 402 });
  }

  const result = await capturePaymentByProviderRef({
    providerRef: verification.txRef,
    amountCents: verification.amount,
    currency: verification.currency || 'BWP',
    providerPaymentId: String(parsed.data.tx_id),
    traceId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, paymentId: result.paymentId || undefined, replayed: result.replayed || undefined });
}
