import { pgTable, uuid, varchar, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

export const pricingSnapshots = pgTable('pricing_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  baseCurrency: varchar('base_currency', { length: 3 }).notNull(),
  displayCurrency: varchar('display_currency', { length: 3 }).notNull(),
  fxRateBps: integer('fx_rate_bps'),
  lineItems: jsonb('line_items').notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  pricingVersionId: uuid('pricing_version_id'),
  rulesApplied: jsonb('rules_applied'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});