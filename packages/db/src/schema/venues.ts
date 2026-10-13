import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { suppliers } from './suppliers';

// §6.18 MICE slice (FR-5.25.8/9). Standalone venues and spaces with layout
// capacities, expiring holds/options, and the corporate three-quote RFQ inbox.
export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  standalone: boolean('standalone').notNull().default(false),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const venueSpaces = pgTable('venue_spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  capacities: jsonb('capacities').notNull().default({}),
  halfDayCents: integer('half_day_cents'),
  fullDayCents: integer('full_day_cents'),
  addOns: jsonb('add_ons').notNull().default([]),
});

export const venueHolds = pgTable('venue_holds', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id')
    .notNull()
    .references(() => venueSpaces.id, { onDelete: 'cascade' }),
  heldBy: varchar('held_by', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  state: varchar('state', { length: 20 }).notNull().default('held'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rfqs = pgTable('rfqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  requirements: text('requirements').notNull(),
  eventDate: timestamp('event_date', { withTimezone: true }),
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rfqQuotes = pgTable('rfq_quotes', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfqId: uuid('rfq_id')
    .notNull()
    .references(() => rfqs.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  message: text('message'),
  state: varchar('state', { length: 20 }).notNull().default('submitted'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
