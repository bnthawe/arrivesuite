import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, properties, roomTypes } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const createRoomSchema = z.object({
  name: z.string().min(1).max(255),
  maxAdults: z.number().int().min(1).max(20).default(2),
  maxChildren: z.number().int().min(0).max(20).default(0),
  unitCount: z.number().int().min(1).max(1000).default(1),
});

async function ownProperty(supplierId: string, propertyId: string) {
  const [property] = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
  if (!property || property.supplierId !== supplierId || property.deletedAt) return null;
  return property;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const property = await ownProperty(gate.supplier.id, id);
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }
  const rooms = await db.select().from(roomTypes).where(eq(roomTypes.propertyId, id));
  return NextResponse.json({ rooms });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const property = await ownProperty(gate.supplier.id, id);
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [room] = await db
    .insert(roomTypes)
    .values({
      propertyId: id,
      name: parsed.data.name,
      maxAdults: parsed.data.maxAdults,
      maxChildren: parsed.data.maxChildren,
      unitCount: parsed.data.unitCount,
    })
    .returning();
  return NextResponse.json({ room }, { status: 201 });
}
