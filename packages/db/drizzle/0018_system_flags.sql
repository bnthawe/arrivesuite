-- Runtime kill switches. Rows are intentionally seeded enabled; an operator
-- flips them from the admin console without a redeploy.
CREATE TABLE IF NOT EXISTS "system_flags" (
  "key" varchar(100) PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "note" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_flags_updated_by_accounts_id_fk'
  ) THEN
    ALTER TABLE "system_flags"
      ADD CONSTRAINT "system_flags_updated_by_accounts_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "accounts"("id") ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO "system_flags" ("key", "enabled")
VALUES ('bookings_enabled', true), ('payments_enabled', true)
ON CONFLICT ("key") DO NOTHING;
