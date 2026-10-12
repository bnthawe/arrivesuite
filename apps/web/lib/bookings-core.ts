import { desc, eq, like } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  auditEvents,
  accounts,
  bookingItems,
  bookings,
  db,
  hashPassword,
} from '@arrivesuite/db';
import { enqueueReconciliation } from './queues';

export interface BookingItemInput {
  itemType: string;
  itemRef: string;
  itemSupplierType: string;
  quantity?: number;
  netCents: number;
  markupCents?: number;
  taxCents?: number;
}

export interface CreateBookingInput {
  accountId: string;
  channel: 'web' | 'whatsapp' | 'api' | 'backoffice';
  currency: string;
  items: BookingItemInput[];
  traceId?: string;
  idempotencyKey?: string | null;
}

export interface CreatedBooking {
  booking: typeof bookings.$inferSelect;
  items: (typeof bookingItems.$inferSelect)[];
  replayed: boolean;
}

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

export function traceIdFromRequest(request: Request, fallback?: string): string {
  return (
    request.headers.get(process.env.TRACE_ID_HEADER ?? 'x-trace-id') ??
    fallback ??
    crypto.randomUUID()
  );
}

// Sourced guest flows identify the guest by email. Reuse the account when it
// exists; otherwise provision a customer with an unusable random password
// (real credentials arrive via OTP/magic link later).
export async function resolveGuestAccount(
  email: string,
  name: string | null,
): Promise<typeof accounts.$inferSelect> {
  const normalized = email.toLowerCase();
  const [existing] = await db.select().from(accounts).where(eq(accounts.email, normalized)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(accounts)
    .values({
      email: normalized,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      realm: 'customer',
      name,
    })
    .returning();
  await db.insert(auditEvents).values({
    actorId: created.id,
    actorRealm: 'customer',
    action: 'account.provisioned',
    entityType: 'account',
    entityId: created.id,
  });
  return created;
}

export async function createBooking(
  input: CreateBookingInput,
): Promise<{ ok: true; created: CreatedBooking; status: 200 | 201 } | { ok: false; status: number; error: string }> {
  const idempotencyKey = input.idempotencyKey ?? null;

  const itemsWithTotals = input.items.map((item) => {
    const quantity = item.quantity ?? 1;
    const markupCents = item.markupCents ?? 0;
    const taxCents = item.taxCents ?? 0;
    return { ...item, quantity, markupCents, taxCents, totalCents: item.netCents + markupCents + taxCents };
  });
  const subtotalCents = itemsWithTotals.reduce((s, i) => s + i.netCents + i.markupCents, 0);
  const taxCents = itemsWithTotals.reduce((s, i) => s + i.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      if (existing.accountId !== input.accountId || existing.totalCents !== totalCents) {
        return { ok: false, status: 409, error: 'Idempotency key already used with a different payload' };
      }
      const priorItems = await db
        .select()
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, existing.id));
      return { ok: true, created: { booking: presentBooking(existing), items: priorItems, replayed: true }, status: 200 };
    }
  }

  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
  if (!account || account.deletedAt) {
    return { ok: false, status: 400, error: 'Unknown account' };
  }

  const prefix = process.env.ARS_REF_PREFIX ?? process.env.BOOKING_REF_PREFIX ?? 'ARS';
  const traceId = input.traceId ?? crypto.randomUUID();

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

      return { ok: true, created: { booking: presentBooking(booking), items: createdItems, replayed: false }, status: 201 };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === '23505' && idempotencyKey) {
        const [winner] = await db
          .select()
          .from(bookings)
          .where(eq(bookings.idempotencyKey, idempotencyKey))
          .limit(1);
        if (winner) {
          const winnerItems = await db
            .select()
            .from(bookingItems)
            .where(eq(bookingItems.bookingId, winner.id));
          return { ok: true, created: { booking: presentBooking(winner), items: winnerItems, replayed: true }, status: 200 };
        }
      }
      if (code === '23505') continue;
      throw err;
    }
  }

  return { ok: false, status: 500, error: 'Could not allocate booking reference' };
}
