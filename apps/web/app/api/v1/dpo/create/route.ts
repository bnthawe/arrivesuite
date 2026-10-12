import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createDpoToken, dpoHostedPageUrl } from '@arrivesuite/integrations';
import { traceIdFromRequest } from '@/lib/bookings-core';

const createSchema = z.object({
  amount: z.number().int().min(1),
  currency: z.string().length(3).default('BWP'),
  email: z.string().email().max(255).default('test@arrivesuite.local'),
  reference: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(200).default('ArriveSuite booking payment'),
});

// Thin DPO token endpoint for sandbox verification and ops checks.
// Booking-bound flows should use POST /api/v1/payments/init instead.
export async function POST(request: Request) {
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
