-- migration: no-transaction
-- These indexes target the correlated EXISTS filters used by the admin customer list.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_incomplete_customer_idx"
  ON "customer_addresses" ("customer_id")
  WHERE "is_active" = true
    AND (
      NULLIF(BTRIM("province"), '') IS NULL
      OR LOWER(BTRIM("province")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("city"), '') IS NULL
      OR LOWER(BTRIM("city")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("district"), '') IS NULL
      OR LOWER(BTRIM("district")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("subdistrict"), '') IS NULL
      OR LOWER(BTRIM("subdistrict")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("street"), '') IS NULL
      OR LOWER(BTRIM("street")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR LOWER(BTRIM("street")) ~ '^[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,4}$'
    );
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_complete_customer_idx"
  ON "customer_addresses" ("customer_id")
  WHERE "is_active" = true
    AND NOT (
      NULLIF(BTRIM("province"), '') IS NULL
      OR LOWER(BTRIM("province")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("city"), '') IS NULL
      OR LOWER(BTRIM("city")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("district"), '') IS NULL
      OR LOWER(BTRIM("district")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("subdistrict"), '') IS NULL
      OR LOWER(BTRIM("subdistrict")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR NULLIF(BTRIM("street"), '') IS NULL
      OR LOWER(BTRIM("street")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
      OR LOWER(BTRIM("street")) ~ '^[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,4}$'
    );
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_prereg_audit_customer_status_idx"
  ON "customer_addresses" ("customer_id", "coordinate_audit_status")
  WHERE "is_active" = true
    AND "reference_source" = 'PREREG_IMPORT';
-- statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_prereg_audit_queue_idx"
  ON "customer_addresses" ("coordinate_audit_status", "customer_id")
  WHERE "is_active" = true
    AND "reference_source" = 'PREREG_IMPORT'
    AND "reference_location" IS NOT NULL;
