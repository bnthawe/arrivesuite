import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createDpoToken, dpoConfigFromEnv, dpoHostedPageUrl } from '@arrivesuite/integrations';
import { requireAdmin } from '@/lib/admin';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';

const createSchema = z.object({
  amount: z.number().int().min(1),
  currency: z.string().length(3).default('BWP'),
  email: z.string().email().max(255).default('test@arrivesuite.local'),
  reference: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(200).default('ArriveSuite booking payment'),
});

// Ops ceiling for a single token in live mode. A typo in `amount` must not
// mint a hosted page for an arbitrary sum.
const LIVE_AMOUNT_CEILING_MINOR = 50_000_000; // BWP 500,000

// Thin DPO token endpoint for sandbox verification and ops checks.
// Booking-bound flows should use POST /api/v1/payments/init instead.
export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'dpo.create' }, () => handlePost(request));
}

async function handlePost(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Sandbox calls stay open for local dev and tests. In live mode this is a
  // token faucet unless it is admin-only, so gate it before any provider call.
  const dpoCfg = dpoConfigFromEnv();
  if (!dpoCfg.sandbox) {
    const gate = await requireAdmin(request);
    if ('response' in gate) return gate.response;
    if (parsed.data.amount > LIVE_AMOUNT_CEILING_MINOR) {
      return NextResponse.json({ error: 'Amount exceeds ops ceiling' }, { status: 400 });
    }
  }

  const traceId = traceIdFromRequest(request);
  const reference = parsed.data.reference ?? `ARS-DPO-${Date.now().toString(36).toUpperCase()}`;
  try {
    const token = await createDpoToken({
      amountMajor: (parsed.data.amount / 100).toFixed(2),
      currency: parsed.data.currency,
      companyRef: reference,
      email: parsed.data.email,
      serviceDescription: parsed.data.description,
    });
    return NextResponse.json(
      {
        transToken: token.transToken,
        transRef: token.transRef,
        url: dpoHostedPageUrl(token.transToken),
        reference,
        traceId,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'DPO token creation failed', traceId },
      { status: 502 },
    );
  }
}
