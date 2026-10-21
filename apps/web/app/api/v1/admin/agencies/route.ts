import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { db, agencies } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

const createAgencySchema = z.object({
  name: z.string().min(1).max(255),
  creditLimitCents: z.number().int().min(0).default(0),
  paymentTerms: z.string().max(2000).optional(),
});

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const rows = await db.select().from(agencies).orderBy(desc(agencies.createdAt));
  return NextResponse.json({ agencies: rows });
}

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'route:POST:/api/v1/admin/agencies' }, () => handlePost(request));
}

async function handlePost(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createAgencySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [agency] = await db
    .insert(agencies)
    .values({
      name: parsed.data.name,
      creditLimitCents: parsed.data.creditLimitCents,
      paymentTerms: parsed.data.paymentTerms ?? null,
    })
    .returning();
  return NextResponse.json({ agency }, { status: 201 });
}
