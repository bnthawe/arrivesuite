-- §6.3 suppliers (onboarding slice).
CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL UNIQUE REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "legal_name" text NOT NULL,
  "trading_name" text,
  "status" varchar(20) NOT NULL DEFAULT 'prospect',
  "trust_score" integer NOT NULL DEFAULT 0,
  "country_code" char(2) NOT NULL DEFAULT 'BW',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  "deleted_at" timestamptz
);
