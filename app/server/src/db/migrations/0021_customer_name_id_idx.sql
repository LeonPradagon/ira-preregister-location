-- migration: no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_name_id_idx"
  ON "customers" ("name", "id");
