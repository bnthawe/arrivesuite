import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, suppliers } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

const statusSchema = z.object({
  status: z.enum(['prospect', 'pending', 'active', 'suspended', 'archived']),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withIdempotency(request, { scope: 'route:PATCH:/api/v1/admin/suppliers/[id]', identity: id }, () => handlePatch(request, ctx));
}

async function handlePatch(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [supplier] = await db
    .update(suppliers)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(suppliers.id, id))
    .returning();
  if (!supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
  }
  return NextResponse.json({ supplier });
}
