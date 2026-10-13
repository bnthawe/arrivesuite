import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, properties } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const patchPropertySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['draft', 'published', 'disabled']).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = patchPropertySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [existing] = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  if (!existing || existing.supplierId !== gate.supplier.id || existing.deletedAt) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }
  // Publishing gates on an approved supplier; drafts are always allowed.
  if (parsed.data.status === 'published' && gate.supplier.status !== 'active') {
    return NextResponse.json({ error: 'Supplier must be active to publish' }, { status: 409 });
  }

  const updates: Partial<{ name: string; description: string | null; status: string; updatedAt: Date }> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  updates.updatedAt = new Date();

  const [property] = await db.update(properties).set(updates).where(eq(properties.id, id)).returning();
  return NextResponse.json({ property });
}
