-- Supplier contracts and e-signing support.
CREATE TABLE IF NOT EXISTS "contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_id" uuid NOT NULL,
  "title" varchar(255) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "document_key" varchar(500),
  "signer_name" varchar(255),
  "signer_email" text,
  "signed_at" timestamp with time zone,
  "signature_data" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_supplier_id_suppliers_id_fk'
  ) THEN
    ALTER TABLE "contracts"
      ADD CONSTRAINT "contracts_supplier_id_suppliers_id_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "contracts_supplier_id_idx" ON "contracts" ("supplier_id");
CREATE INDEX IF NOT EXISTS "contracts_status_idx" ON "contracts" ("status");
