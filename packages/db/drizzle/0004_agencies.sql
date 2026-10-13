-- §6.2 agencies + agency_users.
CREATE TABLE IF NOT EXISTS "agencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "credit_limit_cents" integer NOT NULL DEFAULT 0,
  "payment_terms" text,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "agency_users" (
  "agency_id" uuid NOT NULL REFERENCES "agencies"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "role" varchar(50) NOT NULL DEFAULT 'member',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("agency_id", "account_id")
);
