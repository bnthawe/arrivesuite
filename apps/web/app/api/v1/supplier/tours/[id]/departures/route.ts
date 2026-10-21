import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, tours, tourDepartures } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const createDepartureSchema = z.object({
  departureAt: z.string().datetime(),
  capacity: z.number().int().min(1).max(10000),
});

async function ownTour(supplierId: string, tourId: string) {
  const [tour] = await db.select().from(tours).where(eq(tours.id, tourId)).limit(1);
  if (!tour || tour.supplierId !== supplierId) return null;
  return tour;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const tour = await ownTour(gate.supplier.id, id);
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  const departures = await db.select().from(tourDepartures).where(eq(tourDepartures.tourId, id));
  return NextResponse.json({ departures });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withIdempotency(request, { scope: 'route:POST:/api/v1/supplier/tours/[id]/departures', identity: id }, () => handlePost(request, ctx));
}

async function handlePost(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const tour = await ownTour(gate.supplier.id, id);
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createDepartureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (new Date(parsed.data.departureAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Departure must be in the future' }, { status: 400 });
  }
  const [departure] = await db
    .insert(tourDepartures)
    .values({
      tourId: id,
      departureAt: new Date(parsed.data.departureAt),
      capacity: parsed.data.capacity,
    })
    .returning();
  return NextResponse.json({ departure }, { status: 201 });
}
