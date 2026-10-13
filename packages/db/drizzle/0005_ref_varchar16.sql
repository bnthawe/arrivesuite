-- Spec §6.17 mandates a 16-wide column for 15-char ARS-YYYY-NNNNNN refs.
-- char(16) blank-padding caused a backfill mismatch bug, so store the same
-- values unpadded. USING TRIM strips padding left by the char era.
ALTER TABLE "bookings" ALTER COLUMN "ref" TYPE varchar(16) USING TRIM("ref");
