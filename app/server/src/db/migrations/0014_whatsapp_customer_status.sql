ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "whatsapp_status" varchar(32) NOT NULL DEFAULT 'NOT_CHECKED';
-- statement-breakpoint
UPDATE "customers"
SET "whatsapp_status" = CASE
  WHEN "phone_e164" ~ '^\+[1-9][0-9]{7,14}$' THEN 'VALID_FORMAT'
  ELSE 'FORMAT_INVALID'
END
WHERE "whatsapp_status" = 'NOT_CHECKED';
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_whatsapp_status_idx"
  ON "customers" ("whatsapp_status");
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "customer_id" uuid;
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  DROP CONSTRAINT IF EXISTS "whatsapp_delivery_logs_customer_id_customers_id_fk";
-- statement-breakpoint
ALTER TABLE "whatsapp_delivery_logs"
  ADD CONSTRAINT "whatsapp_delivery_logs_customer_id_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_delivery_logs_customer_status_idx"
  ON "whatsapp_delivery_logs" ("customer_id", "status");
