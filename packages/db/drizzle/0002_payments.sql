-- §6.6 payments slice: intents, payments, refunds.
CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE RESTRICT,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "method" varchar(20) NOT NULL DEFAULT 'paystack',
  "state" varchar(20) NOT NULL DEFAULT 'requires_payment',
  "provider_ref" varchar(100),
  "idempotency_key" varchar(100) UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "intent_id" uuid NOT NULL REFERENCES "payment_intents"("id") ON DELETE RESTRICT,
  "provider_payment_id" varchar(100),
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "captured_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
  "amount_cents" integer NOT NULL,
  "reason" text,
  "state" varchar(20) NOT NULL DEFAULT 'pending',
  "approved_by" uuid REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intents_booking ON payment_intents(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_intent ON payments(intent_id);
