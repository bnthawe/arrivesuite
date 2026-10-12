-- FR-15.35 / API contract v1.0: booking refs are ARS-YYYY-NNNNNN (16 chars).
ALTER TABLE "bookings" ALTER COLUMN "ref" TYPE char(16);
