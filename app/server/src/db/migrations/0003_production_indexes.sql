-- migration: no-transaction
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "file_path" text NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'QUEUED',
  "rows_read" integer NOT NULL DEFAULT 0,
  "rows_processed" integer NOT NULL DEFAULT 0,
  "rows_failed" integer NOT NULL DEFAULT 0,
  "customers_upserted" integer NOT NULL DEFAULT 0,
  "addresses_inserted" integer NOT NULL DEFAULT 0,
  "addresses_updated" integer NOT NULL DEFAULT 0,
  "error_summary" text,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "import_jobs_status_updated_idx"
  ON "import_jobs" ("status", "updated_at" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "reminders_due_queue_idx"
  ON "reminders" ("status", "scheduled_at", "id")
  WHERE "status" = 'SCHEDULED';
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "reminders_provider_message_id_idx"
  ON "reminders" ("provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "whatsapp_delivery_logs_provider_message_id_idx"
  ON "whatsapp_delivery_logs" ("provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "validation_results_session_created_idx"
  ON "validation_results" ("session_id", "created_at" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_reviews_session_created_idx"
  ON "verification_reviews" ("session_id", "created_at" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "reminders_session_created_idx"
  ON "reminders" ("session_id", "created_at" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "location_captures_session_created_idx"
  ON "location_captures" ("session_id", "created_at" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_entity_timestamp_idx"
  ON "audit_logs" ("entity_id", "timestamp" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "audit_logs_timestamp_idx"
  ON "audit_logs" ("timestamp" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_updated_id_idx"
  ON "customers" ("updated_at" DESC, "id" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_sessions_updated_id_idx"
  ON "verification_sessions" ("updated_at" DESC, "id" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_campaign_items_campaign_created_idx"
  ON "verification_campaign_items" ("campaign_id", "created_at" DESC, "id" DESC);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_campaigns_running_materialization_idx"
  ON "verification_campaigns" ("status", "materialization_complete", "updated_at", "id");
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_campaign_items_queue_id_idx"
  ON "verification_campaign_items" ("status", "scheduled_at", "id");
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_campaign_items_processing_idx"
  ON "verification_campaign_items" ("processing_started_at", "id")
  WHERE "status" = 'PROCESSING';
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_name_trgm_idx"
  ON "customers" USING GIN ("name" gin_trgm_ops);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_external_id_trgm_idx"
  ON "customers" USING GIN ("external_id" gin_trgm_ops);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_phone_trgm_idx"
  ON "customers" USING GIN ("phone_e164" gin_trgm_ops);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_source_record_id_trgm_idx"
  ON "customers" USING GIN ("source_record_id" gin_trgm_ops);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_sessions_phone_trgm_idx"
  ON "verification_sessions" USING GIN ("registered_phone_snapshot" gin_trgm_ops);
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "integration_outbox_created_idx"
  ON "integration_outbox" ("created_at" DESC);
