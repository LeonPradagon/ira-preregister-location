ALTER TABLE "verification_campaigns"
  ADD COLUMN IF NOT EXISTS "daily_send_limit" integer DEFAULT 500 NOT NULL;
