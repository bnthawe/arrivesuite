import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';

// §6.6 double-entry ledger. Every posting batch shares a transaction_id and
// must balance (debits == credits); enforced in lib/ledger, never updated.
export const ledgerAccounts = pgTable('ledger_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  kind: varchar('kind', { length: 20 }).notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
  direction: varchar('direction', { length: 10 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  referenceType: varchar('reference_type', { length: 50 }).notNull(),
  referenceId: varchar('reference_id', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
});
