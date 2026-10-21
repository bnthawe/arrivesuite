import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, tours } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const createTourSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(100).optional(),
  durationMinutes: z.number().int().min(0).max(43200).optional(),
  meetingPoint: z.string().max(2000).optional(),
  description: z.string().max(10000).optional(),
});

export async function GET(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const rows = await db
    .select()
    .from(tours)
    .where(eq(tours.supplierId, gate.supplier.id))
    .orderBy(desc(tours.createdAt));
  return NextResponse.json({ tours: rows });
}

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'route:POST:/api/v1/supplier/tours' }, () => handlePost(request));
}

async function handlePost(request: Request) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createTourSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [tour] = await db
    .insert(tours)
    .values({
      supplierId: gate.supplier.id,
      name: parsed.data.name,
      category: parsed.data.category ?? null,
      durationMinutes: parsed.data.durationMinutes ?? null,
      meetingPoint: parsed.data.meetingPoint ?? null,
      description: parsed.data.description ?? null,
    })
    .returning();
  return NextResponse.json({ tour }, { status: 201 });
}
