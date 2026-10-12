import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { db, routeMarkupRules } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

const createRuleSchema = z.object({
  origin: z.string().length(3).transform((s) => s.toUpperCase()).nullable().optional(),
  destination: z.string().length(3).transform((s) => s.toUpperCase()).nullable().optional(),
  pctBps: z.number().int().min(0).max(100_000),
  fixedCents: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  note: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const rules = await db.select().from(routeMarkupRules).orderBy(desc(routeMarkupRules.createdAt));
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [rule] = await db
    .insert(routeMarkupRules)
    .values({
      origin: parsed.data.origin ?? null,
      destination: parsed.data.destination ?? null,
      pctBps: parsed.data.pctBps,
      fixedCents: parsed.data.fixedCents,
      active: parsed.data.active,
      note: parsed.data.note ?? null,
    })
    .returning();
  return NextResponse.json({ rule }, { status: 201 });
}
