import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { suppliers } from './suppliers';

// §6.3 tours slice (FR-5.25.7). Resource tracking (guides/vehicles) and
// MICE venues arrive in later slices.
export const tours = pgTable('tours', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }),
  durationMinutes: integer('duration_minutes'),
  meetingPoint: text('meeting_point'),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tourDepartures = pgTable('tour_departures', {
  id: uuid('id').primaryKey().defaultRandom(),
  tourId: uuid('tour_id')
    .notNull()
    .references(() => tours.id, { onDelete: 'cascade' }),
  departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
  capacity: integer('capacity').notNull(),
  bookedCount: integer('booked_count').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('scheduled'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tourPaxTiers = pgTable('tour_pax_tiers', {
  id: uuid('id').primaryKey().defaultRandom(),
  departureId: uuid('departure_id')
    .notNull()
    .references(() => tourDepartures.id, { onDelete: 'cascade' }),
  tier: varchar('tier', { length: 50 }).notNull(),
  priceCents: integer('price_cents').notNull(),
});

export const tourItineraries = pgTable('tour_itineraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tourId: uuid('tour_id')
    .notNull()
    .references(() => tours.id, { onDelete: 'cascade' }),
  dayNumber: integer('day_number').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
});
