-- §6.3 accommodation slice: properties, room types, rate plans.
CREATE TABLE IF NOT EXISTS "properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid NOT NULL REFERENCES "suppliers"("id") ON DELETE RESTRICT,
  "name" varchar(255) NOT NULL,
  "type" varchar(30) NOT NULL DEFAULT 'hotel',
  "description" text,
  "country_code" char(2) NOT NULL DEFAULT 'BW',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  "deleted_at" timestamptz
);
CREATE TABLE IF NOT EXISTS "room_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "max_adults" integer NOT NULL DEFAULT 2,
  "max_children" integer NOT NULL DEFAULT 0,
  "unit_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "rate_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "room_type_id" uuid NOT NULL REFERENCES "room_types"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "meal_plan" varchar(50),
  "base_nightly_cents" integer NOT NULL,
  "min_stay" integer NOT NULL DEFAULT 1,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_supplier ON properties(supplier_id);
