ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
-- statement-breakpoint
ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "cancellation_reason" varchar(64);
-- statement-breakpoint
ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "cancelled_by" varchar(128);
-- statement-breakpoint
ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamptz;
-- statement-breakpoint
UPDATE "reminders"
SET "cancellation_reason" = 'LEGACY_CANCELLED',
    "cancelled_by" = 'legacy'
WHERE "status" = 'CANCELLED'
  AND "cancellation_reason" IS NULL;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_cancellation_reason_idx"
  ON "reminders" ("status", "cancellation_reason", "cancelled_at");
