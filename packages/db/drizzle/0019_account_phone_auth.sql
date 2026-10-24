-- WhatsApp OTP auth support: make email/password nullable, add phone_e164 and auth_method.
ALTER TABLE "accounts" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "phone_e164" varchar(20);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "auth_method" varchar(20) NOT NULL DEFAULT 'password';
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_phone_e164_unique" ON "accounts" ("phone_e164") WHERE "phone_e164" IS NOT NULL;