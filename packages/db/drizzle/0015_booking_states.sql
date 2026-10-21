-- Section 9.1 explicit booking states (ADR-0020). Additive enum values only.
-- Existing `pending` rows stay legacy in this migration because PostgreSQL
-- cannot use a new enum value in the same transaction that adds it. The
-- `db:backfill-booking-status` step runs after this migration commits and
-- moves `pending` to `pending_payment` and updates the column default.
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'ticketing';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'ticketed';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'exchanging';
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'fulfilled';
