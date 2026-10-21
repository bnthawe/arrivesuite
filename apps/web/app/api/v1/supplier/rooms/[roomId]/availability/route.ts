import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, properties, roomTypes } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';
import { setAvailability } from '@/lib/availability';

const rangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  availableUnits: z.number().int().min(0).max(10000),
});

async function ownRoom(supplierId: string, roomId: string) {
  const [room] = await db.select().from(roomTypes).where(eq(roomTypes.id, roomId)).limit(1);
  if (!room) return null;
  const [property] = await db.select().from(properties).where(eq(properties.id, room.propertyId)).limit(1);
  if (!property || property.supplierId !== supplierId) return null;
  return room;
}

export async function POST(request: Request, ctx: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await ctx.params;
  return withIdempotency(request, { scope: 'route:POST:/api/v1/supplier/rooms/[roomId]/availability', identity: roomId }, () => handlePost(request, ctx));
}

async function handlePost(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
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

  const parsed = rangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const result = await setAvailability(roomId, { start: parsed.data.start, end: parsed.data.end }, parsed.data.availableUnits);
  return NextResponse.json(result, { status: 201 });
}
