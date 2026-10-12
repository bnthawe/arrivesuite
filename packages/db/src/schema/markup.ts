import { pgTable, uuid, varchar, char, integer, boolean, timestamp, text } from 'drizzle-orm/pg-core';

// Hybrid route markup (contract: Hybrid Route Markup doc).
// Route rule: commission = round(net * pctBps / 10000) + fixedCents.
// Channel tier modifies the route commission:
//   b2c   → route as-is
//   b2b   → 2% volume discount off the commission
//   agent → route commission + 5% of net on top (split)
//   govt  → flat 8% of net, route rules ignored (tender compliance)
export const routeMarkupRules = pgTable('route_markup_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  origin: char('origin', { length: 3 }),
  destination: char('destination', { length: 3 }),
  pctBps: integer('pct_bps').notNull(),
  fixedCents: integer('fixed_cents').notNull().default(0),
  active: boolean('active').notNull().default(true),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channelMarkupTiers = pgTable('channel_markup_tiers', {
  channel: varchar('channel', { length: 20 }).primaryKey(),
  mode: varchar('mode', { length: 20 }).notNull(),
  pctBps: integer('pct_bps').notNull().default(0),
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
