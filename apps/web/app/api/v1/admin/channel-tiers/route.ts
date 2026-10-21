import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, channelMarkupTiers } from '@arrivesuite/db';
import { requireAdmin } from '@/lib/admin';

const tierSchema = z.object({
  channel: z.enum(['b2c', 'b2b', 'agent', 'govt']),
  mode: z.enum(['route', 'route_minus_pct', 'route_plus_pct', 'flat']),
  pctBps: z.number().int().min(0).max(100_000).default(0),
  active: z.boolean().default(true),
});

export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;
  const tiers = await db.select().from(channelMarkupTiers);
  return NextResponse.json({ tiers });
}

export async function PUT(request: Request) {
  return withIdempotency(request, { scope: 'route:PUT:/api/v1/admin/channel-tiers' }, () => handlePut(request));
}

async function handlePut(request: Request) {
  const gate = await requireAdmin(request);
  if ('response' in gate) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = tierSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [tier] = await db
    .insert(channelMarkupTiers)
    .values({
      channel: parsed.data.channel,
      mode: parsed.data.mode,
      pctBps: parsed.data.pctBps,
      active: parsed.data.active,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: channelMarkupTiers.channel,
      set: {
        mode: parsed.data.mode,
        pctBps: parsed.data.pctBps,
        active: parsed.data.active,
        updatedAt: new Date(),
      },
    })
    .returning();
  return NextResponse.json({ tier });
}
