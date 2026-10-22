import { pgTable, varchar, boolean, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';

// Runtime kill switches. Missing rows default to enabled, so a fresh
// deployment can accept bookings before the seed migration runs.
export const systemFlags = pgTable('system_flags', {
  key: varchar('key', { length: 100 }).primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  note: text('note'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => accounts.id, { onDelete: 'set null' }),
});
