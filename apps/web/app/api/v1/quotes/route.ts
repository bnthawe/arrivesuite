import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mintQuote } from '@arrivesuite/pricing';
import { applyRouteMarkup } from '@/lib/route-pricing';

const itemSchema = z.object({
  itemType: z.string().min(1).max(50),
  itemRef: z.string().min(1).max(100),
  quantity: z.number().int().min(1).default(1),
  netCents: z.number().int().min(0),
  markupCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
  origin: z.string().length(3).optional(),
  destination: z.string().length(3).optional(),
});

const quoteSchema = z.object({
  currency: z.string().length(3),
  items: z.array(itemSchema).min(1).max(50),
  ttlMinutes: z.number().int().min(1).max(1440).default(15),
  segment: z.enum(['b2c', 'b2b', 'agent', 'govt']).default('b2c'),
  applyMarkup: z.boolean().default(true),
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

  // Route markup is computed server-side; client markups are replaced.
  // Pass applyMarkup: false only to freeze provider-supplied totals as-is.
  const priced = parsed.data.applyMarkup
    ? await applyRouteMarkup(
        parsed.data.items.map((i) => ({
          itemType: i.itemType,
          itemRef: i.itemRef,
          quantity: i.quantity,
          netCents: i.netCents,
          taxCents: i.taxCents,
          origin: i.origin,
          destination: i.destination,
        })),
        parsed.data.segment,
      )
    : parsed.data.items.map((i) => ({ ...i, markupCents: i.markupCents, applied: null }));

  const { token, quote } = mintQuote(
    priced.map((p) => ({
      itemType: p.itemType,
      itemRef: p.itemRef,
      quantity: p.quantity ?? 1,
      netCents: p.netCents,
      markupCents: p.markupCents,
      taxCents: p.taxCents ?? 0,
    })),
    parsed.data.currency,
    parsed.data.ttlMinutes,
  );
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
