import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, tourItineraries, tours } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const daySchema = z.object({
  dayNumber: z.number().int().min(1).max(365),
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const [tour] = await db.select().from(tours).where(eq(tours.id, id)).limit(1);
  if (!tour || tour.supplierId !== gate.supplier.id) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  const days = await db.select().from(tourItineraries).where(eq(tourItineraries.tourId, id));
  return NextResponse.json({ days: days.sort((a, b) => a.dayNumber - b.dayNumber) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const [tour] = await db.select().from(tours).where(eq(tours.id, id)).limit(1);
  if (!tour || tour.supplierId !== gate.supplier.id) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = daySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [day] = await db
    .insert(tourItineraries)
    .values({
      tourId: id,
      dayNumber: parsed.data.dayNumber,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
    })
    .returning();
  return NextResponse.json({ day }, { status: 201 });
}
