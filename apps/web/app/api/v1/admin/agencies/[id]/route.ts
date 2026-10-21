import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, agencies } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  paymentTerms: z.string().max(2000).nullable().optional(),
  status: z.enum(['pending', 'active', 'suspended']).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withIdempotency(request, { scope: 'route:PATCH:/api/v1/admin/agencies/[id]', identity: id }, () => handlePatch(request, ctx));
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updates: Partial<{ name: string; creditLimitCents: number; paymentTerms: string | null; status: string; updatedAt: Date }> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.creditLimitCents !== undefined) updates.creditLimitCents = parsed.data.creditLimitCents;
  if (parsed.data.paymentTerms !== undefined) updates.paymentTerms = parsed.data.paymentTerms;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  updates.updatedAt = new Date();

  const [agency] = await db.update(agencies).set(updates).where(eq(agencies.id, id)).returning();
  if (!agency) {
    return NextResponse.json({ error: 'Agency not found' }, { status: 404 });
  }
  return NextResponse.json({ agency });
}
