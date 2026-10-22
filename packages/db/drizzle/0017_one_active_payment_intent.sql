-- A booking can have only one payable intent at a time. Application code also
-- checks this, but the partial unique index closes the concurrent-init race.
-- Expire older active intents first so the index can be created safely.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY booking_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM payment_intents
  WHERE state = 'requires_payment'
)
UPDATE payment_intents p
SET state = 'expired'
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_one_active_per_booking_idx"
  ON "payment_intents" ("booking_id")
  WHERE "state" = 'requires_payment';
