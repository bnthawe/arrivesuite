-- FR-5.25.11–15 availability ledger.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS "availability_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" uuid NOT NULL,
  "range" jsonb NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "state" varchar(20) NOT NULL DEFAULT 'held',
  "channel" varchar(30) NOT NULL DEFAULT 'api',
  "during" tstzrange,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
-- Unit-level double-booking prevention: overlapping held ranges on the
-- same entity conflict at the database level (needs btree_gist above).
DO $$ BEGIN
  ALTER TABLE "availability_holds"
    ADD CONSTRAINT "no_overlapping_holds"
    EXCLUDE USING gist ("entity_id" WITH =, "during" WITH &&)
    WHERE ("state" = 'held');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
CREATE TABLE IF NOT EXISTS "availability_calendar" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_type_id" uuid NOT NULL REFERENCES "room_types"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "available_units" integer NOT NULL DEFAULT 0,
  "booked_units" integer NOT NULL DEFAULT 0,
  "blocked_units" integer NOT NULL DEFAULT 0,
  UNIQUE ("room_type_id", "date")
);
CREATE TABLE IF NOT EXISTS "rate_plan_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rate_plan_id" uuid NOT NULL,
  "date" date NOT NULL,
  "nightly_cents" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE ("rate_plan_id", "date")
);
