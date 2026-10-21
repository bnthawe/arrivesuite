import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, tourDepartures, tourPaxTiers, tours } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const tierSchema = z.object({
  tier: z.string().min(1).max(50),
  priceCents: z.number().int().min(0),
});

async function ownDeparture(supplierId: string, depId: string) {
  const [departure] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, depId)).limit(1);
  if (!departure) return null;
  const [tour] = await db.select().from(tours).where(eq(tours.id, departure.tourId)).limit(1);
  if (!tour || tour.supplierId !== supplierId) return null;
  return departure;
}

export async function GET(request: Request, { params }: { params: Promise<{ depId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { depId } = await params;
  const departure = await ownDeparture(gate.supplier.id, depId);
  if (!departure) {
    return NextResponse.json({ error: 'Departure not found' }, { status: 404 });
  }
  const tiers = await db.select().from(tourPaxTiers).where(eq(tourPaxTiers.departureId, depId));
  return NextResponse.json({ tiers });
}

export async function POST(request: Request, ctx: { params: Promise<{ depId: string }> }) {
  const { depId } = await ctx.params;
  return withIdempotency(request, { scope: 'route:POST:/api/v1/supplier/departures/[depId]/tiers', identity: depId }, () => handlePost(request, ctx));
}

async function handlePost(request: Request, { params }: { params: Promise<{ depId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { depId } = await params;
  const departure = await ownDeparture(gate.supplier.id, depId);
  if (!departure) {
    return NextResponse.json({ error: 'Departure not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = tierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [tier] = await db
    .insert(tourPaxTiers)
    .values({ departureId: depId, tier: parsed.data.tier, priceCents: parsed.data.priceCents })
    .returning();
  return NextResponse.json({ tier }, { status: 201 });
}
