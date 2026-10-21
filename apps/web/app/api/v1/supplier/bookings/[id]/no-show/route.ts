import { withIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { auditEvents, bookingItems, bookings, db, properties, roomTypes, tours } from '@arrivesuite/db';
import { canTransition } from '@/lib/booking-state';
import { requireSupplier } from '@/lib/supplier';
import { traceIdFromRequest } from '@/lib/bookings-core';

const noShowSchema = z.object({
  feeCents: z.number().int().min(0).default(0),
  traceId: z.string().max(100).optional(),
});

// FR-5.5.31: the supplier marks no-show within 24h of arrival. Only
// bookings containing this supplier's items; the fee is recorded in audit
// (ledger posting follows the fee-policy decision, FR-5.25.32).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return withIdempotency(request, { scope: 'route:POST:/api/v1/supplier/bookings/[id]/no-show', identity: id, audit: false }, () => handlePost(request, ctx));
}

async function handlePost(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSupplier(request);
  if ('response' in gate) return gate.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = noShowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const traceId = traceIdFromRequest(request, parsed.data.traceId);

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!canTransition(booking.status, 'no_show')) {
    return NextResponse.json({ error: `Booking is ${booking.status}` }, { status: 409 });
  }

  // Ownership: at least one item must reference this supplier's catalog
  // (property/room/tour ids). Sourced items carry no supplier id, so the
  // catalog cross-check is the proof.
  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, id));
  const catalogIds = await supplierCatalogIds(gate.supplier.id);
  const owned = items.some((i) => catalogIds.has(i.itemRef));
  if (!owned) {
    return NextResponse.json({ error: 'No items from this supplier on the booking' }, { status: 403 });
  }

  // 24h arrival window on the earliest dated item; undated items pass with note.
  const dated = items
    .map((i) => i.startDate?.getTime())
    .filter((t): t is number => typeof t === 'number');
  const earliest = dated.length > 0 ? Math.min(...dated) : null;
  if (earliest !== null) {
    const hoursSinceArrival = (Date.now() - earliest) / 3_600_000;
    if (hoursSinceArrival < 0 || hoursSinceArrival > 24) {
      return NextResponse.json({ error: 'Outside the 24h no-show window' }, { status: 409 });
    }
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: 'no_show', updatedAt: new Date() })
    .where(and(eq(bookings.id, id), eq(bookings.status, booking.status)))
    .returning({ id: bookings.id });
  if (!updated) {
    return NextResponse.json({ error: 'Booking state changed' }, { status: 409 });
  }
  await db.insert(auditEvents).values({
    actorId: gate.account.id,
    actorRealm: 'supplier',
    action: 'booking.no_show',
    entityType: 'booking',
    entityId: id,
    diff: {
      supplierId: gate.supplier.id,
      feeCents: parsed.data.feeCents,
      undatedItems: earliest === null,
    },
    traceId,
  });
  return NextResponse.json({ ok: true, feeCents: parsed.data.feeCents });
}

async function supplierCatalogIds(supplierId: string): Promise<Set<string>> {
  const [props, roomList, tourList] = await Promise.all([
    db.select({ id: properties.id }).from(properties).where(eq(properties.supplierId, supplierId)),
    db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .innerJoin(properties, eq(properties.id, roomTypes.propertyId))
      .where(eq(properties.supplierId, supplierId)),
    db.select({ id: tours.id }).from(tours).where(eq(tours.supplierId, supplierId)),
  ]);
  return new Set([...props.map((p) => p.id), ...roomList.map((r) => r.id), ...tourList.map((t) => t.id)]);
}
