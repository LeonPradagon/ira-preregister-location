CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource" varchar(32) NOT NULL,
  "format" varchar(8) NOT NULL,
  "filters" jsonb NOT NULL,
  "status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
  "file_name" varchar(255),
  "file_path" text,
  "total_rows" integer DEFAULT 0 NOT NULL,
  "processed_rows" integer DEFAULT 0 NOT NULL,
  "part_count" integer DEFAULT 0 NOT NULL,
  "error_summary" text,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_jobs_created_by_created_at_idx"
  ON "export_jobs" ("created_by", "created_at" DESC);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "export_jobs_status_created_at_idx"
  ON "export_jobs" ("status", "created_at");
-- migration: no-transaction
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_updated_id_idx"
  ON "customer_addresses" ("updated_at" DESC, "id" DESC)
  WHERE "is_active" = true;
