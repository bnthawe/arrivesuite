import { pgTable, uuid, varchar, text, timestamp, integer, char } from 'drizzle-orm/pg-core';
import { suppliers } from './suppliers';

// §6.3 accommodation slice (FR-5.25.6). Date-specific prices, allotments
// and availability holds arrive next; rate plans carry base pricing.
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 30 }).notNull().default('hotel'),
  description: text('description'),
  countryCode: char('country_code', { length: 2 }).notNull().default('BW'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const roomTypes = pgTable('room_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  maxAdults: integer('max_adults').notNull().default(2),
  maxChildren: integer('max_children').notNull().default(0),
  unitCount: integer('unit_count').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ratePlans = pgTable('rate_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomTypeId: uuid('room_type_id')
    .notNull()
    .references(() => roomTypes.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  mealPlan: varchar('meal_plan', { length: 50 }),
  baseNightlyCents: integer('base_nightly_cents').notNull(),
  minStay: integer('min_stay').notNull().default(1),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
