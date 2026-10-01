CREATE TABLE IF NOT EXISTS "ticketing_mitra" (
  "mitra_code" varchar(64) PRIMARY KEY NOT NULL,
  "mitra_name" varchar(255) NOT NULL,
  "locations" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticketing_mitra_name_idx" ON "ticketing_mitra" ("mitra_name");
