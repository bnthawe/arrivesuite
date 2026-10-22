-- §6.4 booking envelope: passengers persisted before payment so ticketing can
-- create the provider order after capture. PII stays scoped to the booking.
CREATE TABLE IF NOT EXISTS "booking_guests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "guest_type" varchar(3) DEFAULT 'ADT' NOT NULL,
  "first_name" varchar(100) NOT NULL,
  "last_name" varchar(100) NOT NULL,
  "date_of_birth" date,
  "passport_number" varchar(50),
  "passport_expiry" date,
  "nationality" varchar(2),
  "email" varchar(255),
  "phone_e164" varchar(30),
  "is_lead" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_guests_booking_id_bookings_id_fk'
  ) THEN
    ALTER TABLE "booking_guests"
      ADD CONSTRAINT "booking_guests_booking_id_bookings_id_fk"
      FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "booking_guests_booking_id_idx"
  ON "booking_guests" ("booking_id");
