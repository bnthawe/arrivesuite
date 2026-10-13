-- §6.6 double-entry ledger + seeded chart of accounts.
CREATE TABLE IF NOT EXISTS "ledger_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL UNIQUE,
  "kind" varchar(20) NOT NULL
);
CREATE TABLE IF NOT EXISTS "ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" uuid NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT,
  "direction" varchar(10) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "reference_type" varchar(50) NOT NULL,
  "reference_id" varchar(100) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "note" text
);
CREATE INDEX IF NOT EXISTS idx_ledger_tx ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_entries(reference_type, reference_id);
INSERT INTO ledger_accounts (name, kind) VALUES
  ('cash:paystack', 'cash'),
  ('cash:dpo', 'cash'),
  ('cash:flutterwave', 'cash'),
  ('cash:stripe', 'cash'),
  ('revenue:owned', 'revenue'),
  ('revenue:commission', 'revenue'),
  ('supplier_payable', 'liability'),
  ('refunds', 'contra_revenue')
ON CONFLICT (name) DO NOTHING;
