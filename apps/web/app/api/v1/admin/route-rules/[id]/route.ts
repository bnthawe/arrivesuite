import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, routeMarkupRules } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

const patchSchema = z.object({
  pctBps: z.number().int().min(0).max(100_000).optional(),
  fixedCents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const updates: Partial<{ pctBps: number; fixedCents: number; active: boolean; note: string | null; updatedAt: Date }> = {};
  if (parsed.data.pctBps !== undefined) updates.pctBps = parsed.data.pctBps;
  if (parsed.data.fixedCents !== undefined) updates.fixedCents = parsed.data.fixedCents;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;
  if (parsed.data.note !== undefined) updates.note = parsed.data.note;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  updates.updatedAt = new Date();

  const [rule] = await db.update(routeMarkupRules).set(updates).where(eq(routeMarkupRules.id, id)).returning();
  if (!rule) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }
  return NextResponse.json({ rule });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;
  const [rule] = await db.delete(routeMarkupRules).where(eq(routeMarkupRules.id, id)).returning();
  if (!rule) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
