-- FR-5.25.31 property policies + rate-plan policy library links.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "policies" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "photos" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "check_in_time" time;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "check_out_time" time;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "star_rating" numeric(2,1);
ALTER TABLE "rate_plans" ADD COLUMN IF NOT EXISTS "cancellation_policy" varchar(20) NOT NULL DEFAULT 'flexible';
ALTER TABLE "rate_plans" ADD COLUMN IF NOT EXISTS "refundable" boolean NOT NULL DEFAULT true;
ALTER TABLE "rate_plans" ADD COLUMN IF NOT EXISTS "max_stay" integer;
