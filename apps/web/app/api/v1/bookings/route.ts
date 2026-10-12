import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq, like } from 'drizzle-orm';
import { db, accounts, bookings, bookingItems, auditEvents } from '@arrivesuite/db';
import { enqueueReconciliation } from '@/lib/queues';

const itemSchema = z.object({
  itemType: z.string().min(1).max(50),
  itemRef: z.string().min(1).max(100),
  itemSupplierType: z.string().min(1).max(50),
  quantity: z.number().int().min(1).default(1),
  netCents: z.number().int().min(0),
  markupCents: z.number().int().min(0).default(0),
  taxCents: z.number().int().min(0).default(0),
});

const createBookingSchema = z.object({
  accountId: z.string().uuid(),
  channel: z.enum(['web', 'whatsapp', 'api', 'backoffice']),
  currency: z.string().length(3),
  items: z.array(itemSchema).min(1).max(50),
  traceId: z.string().max(100).optional(),
});

// char(16) blank-pads; the contract shows refs unpadded.
export function presentBooking<T extends { ref: string }>(booking: T): T {
  return { ...booking, ref: booking.ref.trim() };
}

// Contract v1.0 / FR-15.35: refs are ARS-YYYY-NNNNNN (char 16),
// zero-padded yearly sequence, e.g. ARS-2026-000042.
async function allocateRef(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const latest = await db
    .select({ ref: bookings.ref })
    .from(bookings)
    .where(like(bookings.ref, `${prefix}-${year}-%`))
    .orderBy(desc(bookings.ref))
    .limit(1);
  let next = 1;
  if (latest.length > 0) {
    const m = /-(\d{6})\s*$/.exec(latest[0].ref);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${year}-${String(next).padStart(6, '0')}`;
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get('Idempotency-Key')?.slice(0, 100) ?? null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Item totals are computed server-side; clients never set booking totals.
  const itemsWithTotals = input.items.map((item) => ({
    ...item,
    totalCents: item.netCents + item.markupCents + item.taxCents,
  }));
  const subtotalCents = itemsWithTotals.reduce((sum, i) => sum + i.netCents + i.markupCents, 0);
  const taxCents = itemsWithTotals.reduce((sum, i) => sum + i.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  // Replay: same key returns the original booking without creating a second one.
  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(bookings)
      .where(eq(bookings.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      const prior = existing[0];
      if (prior.accountId !== input.accountId || prior.totalCents !== totalCents) {
        return NextResponse.json(
          { error: 'Idempotency key already used with a different payload' },
          { status: 409 },
        );
      }
      const priorItems = await db
        .select()
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, prior.id));
      return NextResponse.json(
        { booking: presentBooking(prior), items: priorItems, replayed: true },
        { status: 200, headers: { 'Idempotent-Replayed': 'true' } },
      );
    }
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .limit(1);
  if (!account || account.deletedAt) {
    return NextResponse.json({ error: 'Unknown account' }, { status: 400 });
  }

  const prefix = process.env.ARS_REF_PREFIX ?? process.env.BOOKING_REF_PREFIX ?? 'ARS';
  const traceId = input.traceId ?? crypto.randomUUID();

  // Ref has a unique constraint; retry on collision or idempotency race.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = await allocateRef(prefix);
    try {
      const [booking] = await db
        .insert(bookings)
        .values({
          ref,
          accountId: input.accountId,
          channel: input.channel,
          currency: input.currency.toUpperCase(),
          baseCurrency: 'BWP',
          subtotalCents,
          taxCents,
          totalCents,
          idempotencyKey,
          traceId,
        })
        .returning();

      const createdItems = await db
        .insert(bookingItems)
        .values(
          itemsWithTotals.map((item) => ({
            bookingId: booking.id,
            itemType: item.itemType,
            itemRef: item.itemRef,
            itemSupplierType: item.itemSupplierType,
            snapshot: {
              itemType: item.itemType,
              itemRef: item.itemRef,
              quantity: item.quantity,
              netCents: item.netCents,
              markupCents: item.markupCents,
              taxCents: item.taxCents,
            },
            quantity: item.quantity,
            netCents: item.netCents,
            markupCents: item.markupCents,
            taxCents: item.taxCents,
            totalCents: item.totalCents,
          })),
        )
        .returning();

      await db.insert(auditEvents).values({
        actorId: input.accountId,
        actorRealm: account.realm,
        action: 'booking.created',
        entityType: 'booking',
        entityId: booking.id,
        diff: { ref, totalCents, status: booking.status, itemCount: createdItems.length },
        traceId,
      });

      await enqueueReconciliation({ bookingId: booking.id, traceId });

      return NextResponse.json(
        { booking: presentBooking(booking), items: createdItems, replayed: false },
        { status: 201 },
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      // 23505 unique violation: ref collision → retry; idempotency race → read winner.
      if (code === '23505' && idempotencyKey) {
        const winner = await db
          .select()
          .from(bookings)
          .where(eq(bookings.idempotencyKey, idempotencyKey))
          .limit(1);
        if (winner.length > 0) {
          const winnerItems = await db
            .select()
            .from(bookingItems)
            .where(eq(bookingItems.bookingId, winner[0].id));
          return NextResponse.json(
            { booking: presentBooking(winner[0]), items: winnerItems, replayed: true },
            { status: 200, headers: { 'Idempotent-Replayed': 'true' } },
          );
        }
        continue;
      }
      if (code === '23505') continue;
      throw err;
    }
  }

  return NextResponse.json({ error: 'Could not allocate booking reference' }, { status: 500 });
}
