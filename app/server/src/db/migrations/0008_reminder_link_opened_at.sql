ALTER TABLE "reminders"
  ADD COLUMN IF NOT EXISTS "opened_at" timestamptz;

CREATE INDEX IF NOT EXISTS "reminders_session_opened_at_idx"
  ON "reminders" ("session_id", "opened_at");
