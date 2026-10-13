-- Reconciliation alert state (deduplicated paging).
CREATE TABLE IF NOT EXISTS "alert_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar(50) NOT NULL,
  "reference" varchar(100) NOT NULL,
  "severity" varchar(10) NOT NULL DEFAULT 'P2',
  "first_seen_at" timestamptz NOT NULL DEFAULT NOW(),
  "last_notified_at" timestamptz,
  "resolved_at" timestamptz,
  "details" jsonb,
  UNIQUE ("kind", "reference")
);
