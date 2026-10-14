import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, properties } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const PROPERTY_TYPES = ['hotel', 'lodge', 'guesthouse', 'inn', 'motel', 'bnb', 'camp', 'villa', 'self-catering'] as const;

const policiesSchema = z.object({
  cancellationTerms: z.string().max(2000).optional(),
  childTerms: z.string().max(2000).optional(),
  petPolicy: z.string().max(1000).optional(),
  smokingPolicy: z.string().max(1000).optional(),
  quietHours: z.string().max(200).optional(),
}).default({});

const createPropertySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(PROPERTY_TYPES).default('hotel'),
  description: z.string().max(5000).optional(),
  policies: policiesSchema,
  photos: z.array(z.string().url().max(1000)).max(30).default([]),
  checkInTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  starRating: z.number().min(0).max(7).optional(),
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
      policies: parsed.data.policies,
      photos: parsed.data.photos,
      checkInTime: parsed.data.checkInTime ?? null,
      checkOutTime: parsed.data.checkOutTime ?? null,
      starRating: parsed.data.starRating != null ? String(parsed.data.starRating) : null,
    })
    .returning();
  return NextResponse.json({ property }, { status: 201 });
}
