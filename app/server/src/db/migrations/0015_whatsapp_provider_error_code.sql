ALTER TABLE "whatsapp_delivery_logs"
  ADD COLUMN IF NOT EXISTS "provider_error_code" varchar(64);

CREATE INDEX IF NOT EXISTS "whatsapp_delivery_logs_provider_error_code_idx"
  ON "whatsapp_delivery_logs" ("provider_error_code");
