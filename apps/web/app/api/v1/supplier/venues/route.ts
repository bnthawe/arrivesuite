import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, venues } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  standalone: z.boolean().default(false),
  description: z.string().max(10000).optional(),
});

export async function GET(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const rows = await db
    .select()
    .from(venues)
    .where(eq(venues.supplierId, gate.supplier.id))
    .orderBy(desc(venues.createdAt));
  return NextResponse.json({ venues: rows });
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
  const parsed = createVenueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [venue] = await db
    .insert(venues)
    .values({
      supplierId: gate.supplier.id,
      name: parsed.data.name,
      standalone: parsed.data.standalone,
      description: parsed.data.description ?? null,
    })
    .returning();
  return NextResponse.json({ venue }, { status: 201 });
}
