-- §6.3 tours slice: tours, departures, pax tiers, itineraries.
CREATE TABLE IF NOT EXISTS "tours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  "name" varchar(255) NOT NULL,
  "category" varchar(100),
  "duration_minutes" integer,
  "meeting_point" text,
  "description" text,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "tour_departures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tour_id" uuid NOT NULL REFERENCES "tours"("id") ON DELETE CASCADE,
  "departure_at" timestamptz NOT NULL,
  "capacity" integer NOT NULL,
  "booked_count" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'scheduled',
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "tour_pax_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "departure_id" uuid NOT NULL REFERENCES "tour_departures"("id") ON DELETE CASCADE,
  "tier" varchar(50) NOT NULL,
  "price_cents" integer NOT NULL
);
CREATE TABLE IF NOT EXISTS "tour_itineraries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tour_id" uuid NOT NULL REFERENCES "tours"("id") ON DELETE CASCADE,
  "day_number" integer NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text
);
CREATE INDEX IF NOT EXISTS idx_tours_supplier ON tours(supplier_id);
