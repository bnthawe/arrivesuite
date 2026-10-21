import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, venueHolds, venueSpaces, venues } from '@arrivesuite/db';
import { requireSupplier } from '@/lib/supplier';

const holdSchema = z.object({
  heldBy: z.string().min(1).max(255),
  ttlMinutes: z.number().int().min(5).max(10080).default(72 * 60),
});

async function ownSpace(supplierId: string, spaceId: string) {
  const [space] = await db.select().from(venueSpaces).where(eq(venueSpaces.id, spaceId)).limit(1);
  if (!space) return null;
  const [venue] = await db.select().from(venues).where(eq(venues.id, space.venueId)).limit(1);
  if (!venue || venue.supplierId !== supplierId) return null;
  return space;
}

export async function GET(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { spaceId } = await params;
  const space = await ownSpace(gate.supplier.id, spaceId);
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }
  const holds = await db.select().from(venueHolds).where(eq(venueHolds.spaceId, spaceId));
  return NextResponse.json({ holds });
}

export async function POST(request: Request, ctx: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await ctx.params;
  return withIdempotency(request, { scope: 'route:POST:/api/v1/supplier/spaces/[spaceId]/holds', identity: spaceId }, () => handlePost(request, ctx));
}

async function handlePost(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { spaceId } = await params;
  const space = await ownSpace(gate.supplier.id, spaceId);
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = holdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [hold] = await db
    .insert(venueHolds)
    .values({
      spaceId,
      heldBy: parsed.data.heldBy,
      expiresAt: new Date(Date.now() + parsed.data.ttlMinutes * 60_000),
    })
    .returning();
  return NextResponse.json({ hold }, { status: 201 });
}

const releaseSchema = z.object({
  state: z.enum(['released', 'converted']),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await ctx.params;
  return withIdempotency(request, { scope: 'route:PATCH:/api/v1/supplier/spaces/[spaceId]/holds', identity: spaceId }, () => handlePatch(request, ctx));
}

async function handlePatch(request: Request, { params }: { params: Promise<{ spaceId: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { spaceId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = z.object({ holdId: z.string().uuid(), state: releaseSchema.shape.state }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const [hold] = await db.select().from(venueHolds).where(eq(venueHolds.id, parsed.data.holdId)).limit(1);
  if (!hold || hold.spaceId !== spaceId) {
    return NextResponse.json({ error: 'Hold not found' }, { status: 404 });
  }
  const space = await ownSpace(gate.supplier.id, spaceId);
  if (!space) {
    return NextResponse.json({ error: 'Hold not found' }, { status: 404 });
  }
  if (hold.state !== 'held') {
    return NextResponse.json({ error: `Hold already ${hold.state}` }, { status: 409 });
  }
  const [updated] = await db
    .update(venueHolds)
    .set({ state: parsed.data.state })
    .where(eq(venueHolds.id, hold.id))
    .returning();
  return NextResponse.json({ hold: updated });
}
