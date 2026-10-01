CREATE TABLE IF NOT EXISTS "ticketing_fwa_customer_points" (
  "id" bigserial PRIMARY KEY,
  "mitra_source_id" uuid NOT NULL REFERENCES "ticketing_mitra"("source_id") ON DELETE CASCADE,
  "latitude" double precision NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" double precision NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "imported_at" timestamptz NOT NULL DEFAULT now()
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticketing_fwa_points_lat_lon_idx"
  ON "ticketing_fwa_customer_points" ("latitude", "longitude");
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticketing_fwa_points_mitra_idx"
  ON "ticketing_fwa_customer_points" ("mitra_source_id");
