-- migration: no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS "verification_campaign_items_customer_status_idx"
  ON "verification_campaign_items" ("customer_id", "status");
