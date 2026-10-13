-- §6.18 MICE slice: venues, spaces, holds, RFQ inbox.
CREATE TABLE IF NOT EXISTS "venues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  "name" varchar(255) NOT NULL,
  "standalone" boolean NOT NULL DEFAULT false,
  "description" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "venue_spaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "capacities" jsonb NOT NULL DEFAULT '{}',
  "half_day_cents" integer,
  "full_day_cents" integer,
  "add_ons" jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS "venue_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "space_id" uuid NOT NULL REFERENCES "venue_spaces"("id") ON DELETE CASCADE,
  "held_by" varchar(255) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "state" varchar(20) NOT NULL DEFAULT 'held',
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "rfqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "title" varchar(255) NOT NULL,
  "requirements" text NOT NULL,
  "event_date" timestamptz,
  "deadline_at" timestamptz,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "rfq_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rfq_id" uuid NOT NULL REFERENCES "rfqs"("id") ON DELETE CASCADE,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  "amount_cents" integer NOT NULL,
  "message" text,
  "state" varchar(20) NOT NULL DEFAULT 'submitted',
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venues_supplier ON venues(supplier_id);
