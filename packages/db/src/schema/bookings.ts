import { pgTable, uuid, varchar, text, timestamp, integer, numeric, char } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { channelEnum, bookingStatusEnum } from './enums';

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  ref: char('ref', { length: 12 }).notNull().unique(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  channel: channelEnum('channel').notNull(),
  status: bookingStatusEnum('status').notNull().default('pending'),
  currency: varchar('currency', { length: 3 }).notNull(),
  baseCurrency: varchar('base_currency', { length: 3 }).notNull(),
  fxRateBps: integer('fx_rate_bps'),
  subtotalCents: integer('subtotal_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  paidCents: integer('paid_cents').notNull().default(0),
  refundedCents: integer('refunded_cents').notNull().default(0),
  pricingSnapshotId: uuid('pricing_snapshot_id'),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
  traceId: varchar('trace_id', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
});