CREATE TABLE IF NOT EXISTS "ticketing_mitra_areas" (
  "source_site_id" uuid NOT NULL,
  "mitra_source_id" uuid NOT NULL REFERENCES "ticketing_mitra"("source_id") ON DELETE CASCADE,
  "site_name" varchar(255) NOT NULL,
  "location_name" varchar(255),
  "boundary" polygon NOT NULL,
  PRIMARY KEY ("source_site_id", "mitra_source_id")
);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticketing_mitra_areas_mitra_idx"
  ON "ticketing_mitra_areas" ("mitra_source_id");
