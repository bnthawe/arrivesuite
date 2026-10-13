import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, venues, venueSpaces } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const spaceSchema = z.object({
  name: z.string().min(1).max(255),
  capacities: z.object({
    theatre: z.number().int().min(0).optional(),
    boardroom: z.number().int().min(0).optional(),
    banquet: z.number().int().min(0).optional(),
  }).default({}),
  halfDayCents: z.number().int().min(0).optional(),
  fullDayCents: z.number().int().min(0).optional(),
  addOns: z.array(z.object({ name: z.string().min(1), priceCents: z.number().int().min(0) })).default([]),
});

async function ownVenue(supplierId: string, venueId: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue || venue.supplierId !== supplierId) return null;
  return venue;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const venue = await ownVenue(gate.supplier.id, id);
  if (!venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  }
  const spaces = await db.select().from(venueSpaces).where(eq(venueSpaces.venueId, id));
  return NextResponse.json({ spaces });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const venue = await ownVenue(gate.supplier.id, id);
  if (!venue) {
    return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = spaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [space] = await db
    .insert(venueSpaces)
    .values({
      venueId: id,
      name: parsed.data.name,
      capacities: parsed.data.capacities,
      halfDayCents: parsed.data.halfDayCents ?? null,
      fullDayCents: parsed.data.fullDayCents ?? null,
      addOns: parsed.data.addOns,
    })
    .returning();
  return NextResponse.json({ space }, { status: 201 });
}
