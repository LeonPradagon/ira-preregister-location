ALTER TABLE "integration_outbox" ADD COLUMN IF NOT EXISTS "provider_ticket_id" varchar(255);
-- statement-breakpoint
ALTER TABLE "integration_outbox" ADD COLUMN IF NOT EXISTS "provider_response" jsonb;
