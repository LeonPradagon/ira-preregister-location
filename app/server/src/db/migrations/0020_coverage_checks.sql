CREATE TABLE IF NOT EXISTS "coverage_check_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_key" varchar(64) NOT NULL DEFAULT 'FWA',
  "status" varchar(32) NOT NULL DEFAULT 'QUEUED',
  "total_count" integer NOT NULL,
  "completed_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "requested_by" text NOT NULL REFERENCES "user"("id"),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "coverage_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "batch_id" uuid NOT NULL REFERENCES "coverage_check_batches"("id") ON DELETE CASCADE,
  "provider_key" varchar(64) NOT NULL DEFAULT 'FWA',
  "verification_session_id" uuid NOT NULL REFERENCES "verification_sessions"("id"),
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "address_id" uuid NOT NULL REFERENCES "customer_addresses"("id"),
  "latitude" numeric(10, 7) NOT NULL,
  "longitude" numeric(10, 7) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'QUEUED',
  "provider_status" varchar(32),
  "response" jsonb,
  "error" text,
  "requested_by" text NOT NULL REFERENCES "user"("id"),
  "requested_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "coverage_checks_session_provider_created_idx"
  ON "coverage_checks" ("verification_session_id", "provider_key", "created_at");
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "coverage_checks_batch_status_idx"
  ON "coverage_checks" ("batch_id", "status");
