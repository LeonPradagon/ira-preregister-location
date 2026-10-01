ALTER TABLE "integration_outbox"
  ADD COLUMN IF NOT EXISTS "internal_metadata" jsonb;
