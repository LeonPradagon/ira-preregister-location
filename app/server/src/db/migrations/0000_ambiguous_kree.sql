CREATE TABLE "administrative_regions" (
	"code" varchar(13) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"parent_code" varchar(13),
	"level" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" varchar(128) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text DEFAULT 'local:credential' NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" varchar(32) DEFAULT 'VIEWER' NOT NULL,
	"department" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_type" varchar(32) NOT NULL,
	"address_status" varchar(32) NOT NULL,
	"raw_address" text NOT NULL,
	"address_reference" text,
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
	"reference_location" "geography(point,4326)",
	"reference_source" varchar(48) NOT NULL,
	"reference_precision" varchar(32) NOT NULL,
	"reference_confidence" numeric(4, 3) NOT NULL,
	"geocoding_provider" varchar(128),
	"provider_place_id" varchar(255),
	"geocoded_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone_e164" varchar(32) NOT NULL,
	"whatsapp_opt_in_at" timestamp with time zone,
	"whatsapp_opt_in_source" varchar(128),
	"whatsapp_opt_out_at" timestamp with time zone,
	"status" varchar(48) DEFAULT 'ACTIVE' NOT NULL,
	"source_record_id" varchar(128),
	"source_created_at" timestamp with time zone,
	"is_cover_bts" boolean,
	"bts_name" varchar(255),
	"coverage_status" varchar(64),
	"source_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_external_id_unique" UNIQUE("external_id"),
	CONSTRAINT "customers_source_record_id_unique" UNIQUE("source_record_id")
);
--> statement-breakpoint
CREATE TABLE "integration_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_configs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "integration_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_outbox_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "integration_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "location_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"location" "geography(point,4326)" NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"accuracy_meters" numeric(10, 2) NOT NULL,
	"sample_count" integer NOT NULL,
	"best_accuracy_meters" numeric(10, 2) NOT NULL,
	"samples" jsonb NOT NULL,
	"device_timestamp" timestamp with time zone NOT NULL,
	"server_timestamp" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "region_postal_codes" (
	"region_code" varchar(13) PRIMARY KEY NOT NULL,
	"postal_code" varchar(5)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"reminder_number" integer NOT NULL,
	"channel" varchar(32) DEFAULT 'WHATSAPP' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"status" varchar(32) NOT NULL,
	"message_text" text NOT NULL,
	"provider_message_id" varchar(255),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"config_version" varchar(64) NOT NULL,
	"config_values" jsonb NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"capture_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"province_match" boolean NOT NULL,
	"city_match" boolean NOT NULL,
	"district_match" boolean NOT NULL,
	"subdistrict_match" boolean NOT NULL,
	"street_score" numeric(4, 3) NOT NULL,
	"house_number_match" boolean,
	"gps_accuracy_meters" numeric(10, 2) NOT NULL,
	"distance_to_reference_meters" numeric(12, 2),
	"address_score" numeric(4, 3) NOT NULL,
	"result" varchar(64) NOT NULL,
	"reason_codes" jsonb NOT NULL,
	"reverse_geocode" jsonb NOT NULL,
	"reference_precision" varchar(32) NOT NULL,
	"engine_version" varchar(32) NOT NULL,
	"config_version" varchar(64) NOT NULL,
	"captured_latitude" numeric(10, 7) NOT NULL,
	"captured_longitude" numeric(10, 7) NOT NULL,
	"reference_latitude" numeric(10, 7),
	"reference_longitude" numeric(10, 7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_campaign_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_message_id" varchar(255),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processing_started_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Jakarta' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"target_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"opted_out_count" integer DEFAULT 0 NOT NULL,
	"target_filter" jsonb,
	"batch_size" integer DEFAULT 1000 NOT NULL,
	"send_window_days" integer DEFAULT 7 NOT NULL,
	"materialization_cursor" text,
	"materialization_complete" boolean DEFAULT true NOT NULL,
	"materialized_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"reviewer_user_id" text NOT NULL,
	"decision" varchar(48) NOT NULL,
	"reason_code" varchar(128) NOT NULL,
	"review_note" text NOT NULL,
	"engine_result_snapshot" jsonb,
	"before_status" varchar(48) NOT NULL,
	"after_status" varchar(48) NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"customer_id" uuid NOT NULL,
	"current_address_id" uuid NOT NULL,
	"token_id" varchar(64),
	"token_hash" varchar(128),
	"verification_mode" varchar(16) DEFAULT 'LIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"verification_status" varchar(48) DEFAULT 'CREATED' NOT NULL,
	"customer_confirmation_status" varchar(32) DEFAULT 'UNCONFIRMED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"registered_phone_snapshot" varchar(32) NOT NULL,
	"opened_at" timestamp with time zone,
	"customer_confirmed_at" timestamp with time zone,
	"consent_at" timestamp with time zone,
	"location_verified_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_sessions_token_id_unique" UNIQUE("token_id"),
	CONSTRAINT "verification_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" varchar(64) NOT NULL,
	"message_type" varchar(32) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"provider_message_id" varchar(255),
	"status" varchar(32) DEFAULT 'ACCEPTED' NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_delivery_logs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_captures" ADD CONSTRAINT "location_captures_session_id_verification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_session_id_verification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_configs" ADD CONSTRAINT "validation_configs_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_session_id_verification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_capture_id_location_captures_id_fk" FOREIGN KEY ("capture_id") REFERENCES "public"."location_captures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaign_items" ADD CONSTRAINT "verification_campaign_items_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaign_items" ADD CONSTRAINT "verification_campaign_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaign_items" ADD CONSTRAINT "verification_campaign_items_address_id_customer_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaign_items" ADD CONSTRAINT "verification_campaign_items_session_id_verification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_campaigns" ADD CONSTRAINT "verification_campaigns_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_session_id_verification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_reviews" ADD CONSTRAINT "verification_reviews_reviewer_user_id_user_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_campaign_id_verification_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."verification_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_current_address_id_customer_addresses_id_fk" FOREIGN KEY ("current_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;