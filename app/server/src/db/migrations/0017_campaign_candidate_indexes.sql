-- migration: no-transaction
-- These indexes support campaign candidate queries that include customers
-- without reference coordinates alongside coverage-filtered customers.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_missing_reference_customer_idx"
  ON "customer_addresses" ("customer_id")
  WHERE "is_active" = true
    AND "reference_location" IS NULL;
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_unverified_customer_idx"
  ON "customer_addresses" ("customer_id")
  WHERE "is_active" = true
    AND "is_verified" = false;
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_campaign_coverage_status_idx"
  ON "customers" ("coverage_fwa_status", "coverage_ftth_status", "updated_at" DESC, "id" DESC)
  WHERE "status" <> 'SUSPENDED'
    AND "whatsapp_opt_out_at" IS NULL;
