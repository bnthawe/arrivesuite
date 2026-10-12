import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { bookings } from './bookings';

// §6.6 Domain 5 — Payments & Finance (Paystack-first slice).
export const paymentIntents = pgTable('payment_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  method: varchar('method', { length: 20 }).notNull().default('paystack'),
  state: varchar('state', { length: 20 }).notNull().default('requires_payment'),
  providerRef: varchar('provider_ref', { length: 100 }),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  intentId: uuid('intent_id')
    .notNull()
    .references(() => paymentIntents.id, { onDelete: 'restrict' }),
  providerPaymentId: varchar('provider_payment_id', { length: 100 }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'restrict' }),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason'),
  state: varchar('state', { length: 20 }).notNull().default('pending'),
  approvedBy: uuid('approved_by').references(() => accounts.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
