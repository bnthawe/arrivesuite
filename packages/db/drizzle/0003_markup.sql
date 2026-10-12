-- Hybrid route markup tables.
CREATE TABLE IF NOT EXISTS "route_markup_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "origin" char(3),
  "destination" char(3),
  "pct_bps" integer NOT NULL,
  "fixed_cents" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "channel_markup_tiers" (
  "channel" varchar(20) PRIMARY KEY,
  "mode" varchar(20) NOT NULL,
  "pct_bps" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_route_od ON route_markup_rules(origin, destination) WHERE active;

-- Seeds. JNB-MUB 13%+500 is the documented rule; the default and remaining
-- five high-value routes need business sign-off on values (placeholder 10%).
INSERT INTO route_markup_rules (origin, destination, pct_bps, fixed_cents, note)
SELECT NULL, NULL, 1000, 0, 'default network-wide fallback'
WHERE NOT EXISTS (SELECT 1 FROM route_markup_rules WHERE origin IS NULL AND destination IS NULL);
INSERT INTO route_markup_rules (origin, destination, pct_bps, fixed_cents, note)
SELECT 'JNB', 'MUB', 1300, 500, 'contract: Hybrid Route Markup'
WHERE NOT EXISTS (SELECT 1 FROM route_markup_rules WHERE origin = 'JNB' AND destination = 'MUB');
INSERT INTO channel_markup_tiers (channel, mode, pct_bps) VALUES
  ('b2c', 'route', 0),
  ('b2b', 'route_minus_pct', 200),
  ('agent', 'route_plus_pct', 500),
  ('govt', 'flat', 800)
ON CONFLICT DO NOTHING;
