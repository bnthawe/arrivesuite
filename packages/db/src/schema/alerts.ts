import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Deduplicated alert state for the reconciliation sweep. An alert is raised
// once per (kind, reference) when it persists past the grace period, then
// re-notified at most hourly until resolved — never paged every 5 minutes.
export const alertStates = pgTable('alert_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: varchar('kind', { length: 50 }).notNull(),
  reference: varchar('reference', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 10 }).notNull().default('P2'),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  details: jsonb('details'),
});
