ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "reminder_source" varchar(32) NOT NULL DEFAULT 'CUSTOMER_SELECTED';
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_due_source_idx"
  ON "reminders" ("status", "scheduled_at", "reminder_source", "session_id");
