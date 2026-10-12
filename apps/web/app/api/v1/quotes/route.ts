import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mintQuote } from '@arrivesuite/pricing';

const itemSchema = z.object({
  itemType: z.string().min(1).max(50),
  itemRef: z.string().min(1).max(100),
  quantity: z.number().int().min(1).default(1),
  netCents: z.number().int().min(0),
  markupCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
});

const quoteSchema = z.object({
  currency: z.string().length(3),
  items: z.array(itemSchema).min(1).max(50),
  ttlMinutes: z.number().int().min(1).max(1440).default(15),
});

// Signed, expiring price freeze (ADR-0012). Booking paths honor the token;
// totals are enforced server-side at booking time.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { token, quote } = mintQuote(parsed.data.items, parsed.data.currency, parsed.data.ttlMinutes);
  return NextResponse.json(
    {
      quoteToken: token,
      currency: quote.currency,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      expiresAt: new Date(quote.expiresAt).toISOString(),
    },
    { status: 201 },
  );
}
