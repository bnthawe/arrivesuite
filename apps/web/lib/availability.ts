import { TransactionRollbackError, and, eq, gte, sql } from 'drizzle-orm';
import {
  auditEvents,
  availabilityCalendar,
  availabilityHolds,
  db,
} from '@arrivesuite/db';

export interface DateRange {
  start: string;
  end: string;
}

function eachDate(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur < last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// Row-locked allotment hold: decrements free units per night inside one
// transaction (SELECT ... FOR UPDATE). Returns the hold id, or null when
// any night is short. Expired holds are skipped, never counted.
export async function holdRoomNights(
  roomTypeId: string,
  range: DateRange,
  quantity: number,
  channel: string,
  ttlMinutes = 15,
  actorId: string | null = null,
): Promise<{ holdId: string } | { error: string }> {
  const dates = eachDate(range.start, range.end);
  if (dates.length === 0 || dates.length > 365) {
    return { error: 'Invalid date range' };
  }

  // Fast pre-check outside the transaction; re-verified under row locks
  // inside (tx.rollback unwinds via exception, translated below).
  let shortDate: string | null = null;
  try {
    return await db.transaction(async (tx) => {
      for (const date of dates) {
        const [row] = await tx
          .select()
          .from(availabilityCalendar)
          .where(and(eq(availabilityCalendar.roomTypeId, roomTypeId), eq(availabilityCalendar.date, date)))
          .for('update');
        const free = row ? row.availableUnits - row.bookedUnits - row.blockedUnits : 0;
        if (!row || free < quantity) {
          shortDate = date;
          tx.rollback();
          throw new Error('unreachable');
        }
        await tx
          .update(availabilityCalendar)
          .set({ bookedUnits: sql`${availabilityCalendar.bookedUnits} + ${quantity}` })
          .where(eq(availabilityCalendar.id, row.id));
      }

    const [hold] = await tx
      .insert(availabilityHolds)
      .values({
        entityType: 'room',
        entityId: roomTypeId,
        range: { start: range.start, end: range.end, quantity },
        quantity,
        channel,
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      })
      .returning();

    if (actorId) {
      await tx.insert(auditEvents).values({
        actorId,
        action: 'availability.held',
        entityType: 'availability_hold',
        entityId: hold.id,
      });
    }
    return { holdId: hold.id };
    });
  } catch (e) {
    // tx.rollback() unwinds by throwing TransactionRollbackError (its
    // .name stays 'DrizzleError', so only instanceof identifies it).
    if (e instanceof TransactionRollbackError && shortDate) {
      return { error: `No availability on ${shortDate}` };
    }
    throw e;
  }
}

// Atomically confirms a hold (booked units stay, hold flips to converted)
// or releases it back (units returned). Expired holds confirm as 410.
export async function settleHold(
  holdId: string,
  outcome: 'converted' | 'released',
): Promise<{ ok: true } | { error: string; status: number }> {
  return db.transaction(async (tx) => {
    const [hold] = await tx
      .select()
      .from(availabilityHolds)
      .where(eq(availabilityHolds.id, holdId))
      .for('update');
    if (!hold || hold.state !== 'held') {
      return { error: 'Hold unknown or already settled', status: 404 };
    }
    const range = hold.range as { start?: string; end?: string } | null;
    if (!range || typeof range.start !== 'string' || typeof range.end !== 'string') {
      return { error: 'Hold corrupted', status: 500 };
    }
    const units = { entityId: hold.entityId, range: { start: range.start, end: range.end }, quantity: hold.quantity };
    if (hold.expiresAt.getTime() <= Date.now()) {
      await releaseUnits(tx, units);
      await tx.update(availabilityHolds).set({ state: 'expired' }).where(eq(availabilityHolds.id, holdId));
      return { error: 'Hold expired', status: 410 };
    }
    if (outcome === 'released') {
      await releaseUnits(tx, units);
    }
    await tx.update(availabilityHolds).set({ state: outcome }).where(eq(availabilityHolds.id, holdId));
    return { ok: true as const };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function releaseUnits(
  tx: Tx,
  hold: { entityId: string; range: { start: string; end: string }; quantity: number },
): Promise<void> {
  for (const date of eachDate(hold.range.start, hold.range.end)) {
    await tx
      .update(availabilityCalendar)
      .set({ bookedUnits: sql`${availabilityCalendar.bookedUnits} - ${hold.quantity}` })
      .where(
        and(
          eq(availabilityCalendar.roomTypeId, hold.entityId),
          eq(availabilityCalendar.date, date),
          gte(availabilityCalendar.bookedUnits, hold.quantity),
        ),
      );
  }
}

// Supplier-side inventory seeding: set free units for a date span
// (upsert per night). Blocks are separate rows via blockedUnits math.
export async function setAvailability(
  roomTypeId: string,
  range: DateRange,
  availableUnits: number,
): Promise<{ nights: number }> {
  const dates = eachDate(range.start, range.end);
  for (const date of dates) {
    await db
      .insert(availabilityCalendar)
      .values({ roomTypeId, date, availableUnits })
      .onConflictDoUpdate({
        target: [availabilityCalendar.roomTypeId, availabilityCalendar.date],
        set: { availableUnits },
      });
  }
  return { nights: dates.length };
}

// Manual blocks (maintenance, owner use): increments blockedUnits per
// night under the same row lock discipline as holds.
export async function blockDates(
  roomTypeId: string,
  range: DateRange,
  units: number,
): Promise<{ nights: number }> {
  const dates = eachDate(range.start, range.end);
  if (dates.length === 0 || dates.length > 365 || units < 1) {
    return { nights: 0 };
  }
  await db.transaction(async (tx) => {
    for (const date of dates) {
      const [row] = await tx
        .select()
        .from(availabilityCalendar)
        .where(and(eq(availabilityCalendar.roomTypeId, roomTypeId), eq(availabilityCalendar.date, date)))
        .for('update');
      if (!row) {
        await tx.insert(availabilityCalendar).values({ roomTypeId, date, blockedUnits: units });
      } else {
        await tx
          .update(availabilityCalendar)
          .set({ blockedUnits: sql`${availabilityCalendar.blockedUnits} + ${units}` })
          .where(eq(availabilityCalendar.id, row.id));
      }
    }
  });
  return { nights: dates.length };
}
