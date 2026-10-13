import { pgTable, uuid, varchar, text, timestamp, char, integer } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';

// §6.3 suppliers (onboarding slice). Property/room/rate tables arrive with
// the extranet inventory slice; trust_score recomputes nightly (FR-5.5.45).
export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' })
    .unique(),
  legalName: text('legal_name').notNull(),
  tradingName: text('trading_name'),
  status: varchar('status', { length: 20 }).notNull().default('prospect'),
  trustScore: integer('trust_score').notNull().default(0),
  countryCode: char('country_code', { length: 2 }).notNull().default('BW'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
