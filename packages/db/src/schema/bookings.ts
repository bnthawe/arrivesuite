import { pgTable, uuid, varchar, text, timestamp, integer, numeric } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { channelEnum, bookingStatusEnum } from './enums';

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Spec §6.17 says char(16) but refs are 15 chars; char blank-padding
  // caused a real backfill bug, so varchar(16) holds the same values
  // with no padding. Presentation trim is retained as a no-op guard.
  ref: varchar('ref', { length: 16 }).notNull().unique(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
  channel: channelEnum('channel').notNull(),
  status: bookingStatusEnum('status').notNull().default('pending_payment'),
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