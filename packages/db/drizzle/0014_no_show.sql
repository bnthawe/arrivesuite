-- FR-5.5.31 supplier no-show marking. Additive enum value (§6.4).
ALTER TYPE "booking_status" ADD VALUE IF NOT EXISTS 'no_show';
