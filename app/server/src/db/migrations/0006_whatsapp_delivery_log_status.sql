ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'ACCEPTED' NOT NULL;
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamptz;
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "read_at" timestamptz;
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "failed_at" timestamptz;
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "last_error" text;
