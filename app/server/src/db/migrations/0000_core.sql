CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "role" varchar(32) DEFAULT 'VIEWER' NOT NULL,
  "department" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_id" varchar(128) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "phone_e164" varchar(32) NOT NULL,
  "status" varchar(48) DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "address_type" varchar(32) NOT NULL,
  "address_status" varchar(32) NOT NULL,
  "raw_address" text NOT NULL,
  "province" varchar(128) NOT NULL,
  "city" varchar(128) NOT NULL,
  "district" varchar(128) NOT NULL,
  "subdistrict" varchar(128) NOT NULL,
  "postal_code" varchar(16) NOT NULL,
  "street" varchar(255) NOT NULL,
  "house_number" varchar(64) NOT NULL,
  "rt" varchar(8),
  "rw" varchar(8),
  "building" text,
  "block" varchar(64),
  "unit" varchar(64),
  "address_detail" text,
  "landmark" text,
  "reference_location" geography(point,4326),
  "reference_source" varchar(48) NOT NULL,
  "reference_precision" varchar(32) NOT NULL,
  "reference_confidence" numeric(4,3) NOT NULL,
  "geocoding_provider" varchar(128),
  "provider_place_id" varchar(255),
  "geocoded_at" timestamptz,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "valid_from" timestamptz NOT NULL,
  "valid_to" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id"),
  "current_address_id" uuid NOT NULL REFERENCES "customer_addresses"("id"),
  "token_hash" varchar(128) NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "verification_status" varchar(48) DEFAULT 'CREATED' NOT NULL,
  "customer_confirmation_status" varchar(32) DEFAULT 'UNCONFIRMED' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "reminder_count" integer DEFAULT 0 NOT NULL,
  "registered_phone_snapshot" varchar(32) NOT NULL,
  "opened_at" timestamptz,
  "customer_confirmed_at" timestamptz,
  "consent_at" timestamptz,
  "location_verified_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "verification_sessions_reminder_count_range" CHECK ("reminder_count" BETWEEN 0 AND 3)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "location_captures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "verification_sessions"("id"),
  "location" geography(point,4326) NOT NULL,
  "latitude" numeric(10,7) NOT NULL,
  "longitude" numeric(10,7) NOT NULL,
  "accuracy_meters" numeric(10,2) NOT NULL,
  "sample_count" integer NOT NULL,
  "best_accuracy_meters" numeric(10,2) NOT NULL,
  "samples" jsonb NOT NULL,
  "device_timestamp" timestamptz NOT NULL,
  "server_timestamp" timestamptz NOT NULL,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "location_captures_sample_count_range" CHECK ("sample_count" BETWEEN 3 AND 5),
  CONSTRAINT "location_captures_coordinate_range" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND "accuracy_meters" > 0)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "validation_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "verification_sessions"("id"),
  "capture_id" uuid NOT NULL REFERENCES "location_captures"("id"),
  "address_id" uuid NOT NULL REFERENCES "customer_addresses"("id"),
  "province_match" boolean NOT NULL,
  "city_match" boolean NOT NULL,
  "district_match" boolean NOT NULL,
  "subdistrict_match" boolean NOT NULL,
  "street_score" numeric(4,3) NOT NULL,
  "house_number_match" boolean,
  "gps_accuracy_meters" numeric(10,2) NOT NULL,
  "distance_to_reference_meters" numeric(12,2) NOT NULL,
  "address_score" numeric(4,3) NOT NULL,
  "result" varchar(64) NOT NULL,
  "reason_codes" jsonb NOT NULL,
  "reverse_geocode" jsonb NOT NULL,
  "reference_precision" varchar(32) NOT NULL,
  "engine_version" varchar(32) NOT NULL,
  "config_version" varchar(64) NOT NULL,
  "captured_latitude" numeric(10,7) NOT NULL,
  "captured_longitude" numeric(10,7) NOT NULL,
  "reference_latitude" numeric(10,7) NOT NULL,
  "reference_longitude" numeric(10,7) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "verification_sessions"("id"),
  "reviewer_user_id" text NOT NULL REFERENCES "user"("id"),
  "decision" varchar(48) NOT NULL,
  "reason_code" varchar(128) NOT NULL,
  "review_note" text NOT NULL,
  "engine_result_snapshot" jsonb,
  "before_status" varchar(48) NOT NULL,
  "after_status" varchar(48) NOT NULL,
  "reviewed_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "verification_sessions"("id"),
  "reminder_number" integer NOT NULL,
  "channel" varchar(32) DEFAULT 'WHATSAPP' NOT NULL,
  "scheduled_at" timestamptz NOT NULL,
  "sent_at" timestamptz,
  "status" varchar(32) NOT NULL,
  "message_text" text NOT NULL,
  "provider_message_id" varchar(255),
  "retry_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "reminders_session_number_unique" UNIQUE ("session_id", "reminder_number")
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "event_type" varchar(128) NOT NULL,
  "aggregate_type" varchar(64) NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "correlation_id" varchar(128) NOT NULL,
  "idempotency_key" varchar(255) NOT NULL UNIQUE,
  "payload" jsonb NOT NULL,
  "status" varchar(32) DEFAULT 'PENDING' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_retry_at" timestamptz,
  "sent_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(64) NOT NULL UNIQUE,
  "enabled" boolean DEFAULT false NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "status" varchar(64) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "validation_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config_version" varchar(64) NOT NULL,
  "config_values" jsonb NOT NULL,
  "updated_by" text REFERENCES "user"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" text NOT NULL,
  "actor_name" text NOT NULL,
  "action" varchar(128) NOT NULL,
  "entity_type" varchar(64) NOT NULL,
  "entity_id" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "reason" text,
  "timestamp" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "issuer" text NOT NULL DEFAULT 'local:credential',
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text NOT NULL DEFAULT 'local:credential';
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_addresses_reference_location_gist" ON "customer_addresses" USING GIST ("reference_location");
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_captures_location_gist" ON "location_captures" USING GIST ("location");
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_outbox_pending_idx" ON "integration_outbox" ("status", "next_retry_at", "created_at");
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" ("entity_type", "entity_id", "timestamp");
