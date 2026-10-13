import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, properties } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const createPropertySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['hotel', 'lodge', 'guesthouse', 'inn', 'bnb', 'camp', 'villa']).default('hotel'),
  description: z.string().max(5000).optional(),
});

export async function GET(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.supplierId, gate.supplier.id))
    .orderBy(desc(properties.createdAt));
  return NextResponse.json({ properties: rows });
}

export async function POST(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createPropertySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [property] = await db
    .insert(properties)
    .values({
      supplierId: gate.supplier.id,
      name: parsed.data.name,
      type: parsed.data.type,
      description: parsed.data.description ?? null,
    })
    .returning();
  return NextResponse.json({ property }, { status: 201 });
}
