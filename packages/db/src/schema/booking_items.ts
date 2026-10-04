import { pgTable, uuid, varchar, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { bookingItemStatusEnum } from './enums';

export const bookingItems = pgTable('booking_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  itemType: varchar('item_type', { length: 50 }).notNull(),
  itemRef: varchar('item_ref', { length: 100 }).notNull(),
  itemSupplierType: varchar('item_supplier_type', { length: 50 }).notNull(),
  supplierId: uuid('supplier_id'),
  sourceProviderId: varchar('source_provider_id', { length: 50 }),
  snapshot: jsonb('snapshot').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  quantity: integer('quantity').notNull().default(1),
  adults: integer('adults').default(0),
  children: integer('children').default(0),
  infants: integer('infants').default(0),
  netCents: integer('net_cents').notNull(),
  markupCents: integer('markup_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  status: bookingItemStatusEnum('status').notNull().default('reserved'),
  confirmationRef: varchar('confirmation_ref', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});