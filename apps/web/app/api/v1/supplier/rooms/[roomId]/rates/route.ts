import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, properties, ratePlans, roomTypes } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const createRateSchema = z.object({
  name: z.string().min(1).max(255),
  mealPlan: z.string().max(50).optional(),
  baseNightlyCents: z.number().int().min(0),
  minStay: z.number().int().min(1).max(365).default(1),
});

async function ownRoom(supplierId: string, roomId: string) {
  const [room] = await db.select().from(roomTypes).where(eq(roomTypes.id, roomId)).limit(1);
  if (!room) return null;
  const [property] = await db.select().from(properties).where(eq(properties.id, room.propertyId)).limit(1);
  if (!property || property.supplierId !== supplierId) return null;
  return room;
}

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { roomId } = await params;
  const room = await ownRoom(gate.supplier.id, roomId);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  const rates = await db.select().from(ratePlans).where(eq(ratePlans.roomTypeId, roomId));
  return NextResponse.json({ rates });
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { roomId } = await params;
  const room = await ownRoom(gate.supplier.id, roomId);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createRateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [rate] = await db
    .insert(ratePlans)
    .values({
      roomTypeId: roomId,
      name: parsed.data.name,
      mealPlan: parsed.data.mealPlan ?? null,
      baseNightlyCents: parsed.data.baseNightlyCents,
      minStay: parsed.data.minStay,
    })
    .returning();
  return NextResponse.json({ rate }, { status: 201 });
}
