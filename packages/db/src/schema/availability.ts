import { pgTable, uuid, varchar, timestamp, integer, jsonb, date, customType } from 'drizzle-orm/pg-core';
import { roomTypes } from './properties';

const tstzrange = customType<{ data: string }>({
  dataType: () => 'tstzrange',
});

// FR-5.25.11–15 availability ledger. One ledger every source writes to:
// engine allocations, walk-in, phone, manual entries, calendar syncs.
// Unit-level ranges carry an exclusion constraint (no double-booking);
// allotment counters move under row locks (§5.23.4 pattern).
export const availabilityHolds = pgTable('availability_holds', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 30 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  range: jsonb('range').notNull(),
  during: tstzrange('during'),
  quantity: integer('quantity').notNull().default(1),
  state: varchar('state', { length: 20 }).notNull().default('held'),
  channel: varchar('channel', { length: 30 }).notNull().default('api'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityCalendar = pgTable('availability_calendar', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomTypeId: uuid('room_type_id')
    .notNull()
    .references(() => roomTypes.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  availableUnits: integer('available_units').notNull().default(0),
  bookedUnits: integer('booked_units').notNull().default(0),
  blockedUnits: integer('blocked_units').notNull().default(0),
});

export const ratePlanPrices = pgTable('rate_plan_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  ratePlanId: uuid('rate_plan_id').notNull(),
  date: date('date').notNull(),
  nightlyCents: integer('nightly_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
