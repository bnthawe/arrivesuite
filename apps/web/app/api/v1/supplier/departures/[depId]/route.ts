import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, tourDepartures, tours } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const patchDepartureSchema = z.object({
  capacity: z.number().int().min(1).max(10000).optional(),
  status: z.enum(['scheduled', 'confirmed', 'cancelled']).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ depId: string }> }) {
  const { depId } = await ctx.params;
  return withIdempotency(request, { scope: 'route:PATCH:/api/v1/supplier/departures/[depId]', identity: depId }, () => handlePatch(request, ctx));
}

async function handlePatch(request: Request, { params }: { params: Promise<{ depId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { depId } = await params;

  const [departure] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, depId)).limit(1);
  if (!departure) {
    return NextResponse.json({ error: 'Departure not found' }, { status: 404 });
  }
  const [tour] = await db.select().from(tours).where(eq(tours.id, departure.tourId)).limit(1);
  if (!tour || tour.supplierId !== gate.supplier.id) {
    return NextResponse.json({ error: 'Departure not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = patchDepartureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const updates: Partial<{ capacity: number; status: string }> = {};
  if (parsed.data.capacity !== undefined) {
    if (parsed.data.capacity < departure.bookedCount) {
      return NextResponse.json({ error: 'Capacity below already-booked count' }, { status: 409 });
    }
    updates.capacity = parsed.data.capacity;
  }
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  const [updated] = await db.update(tourDepartures).set(updates).where(eq(tourDepartures.id, depId)).returning();
  return NextResponse.json({ departure: updated });
}
