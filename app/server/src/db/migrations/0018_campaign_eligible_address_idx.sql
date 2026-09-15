-- migration: no-transaction
-- This index covers the address predicate used by campaignAvailable queries.
-- Keeping the eligibility expression in the partial predicate avoids scanning
-- all customer_addresses rows before joining back to customers.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customer_addresses_active_campaign_eligible_customer_idx"
  ON "customer_addresses" ("customer_id")
  WHERE "is_active" = true
    AND "is_verified" = false
    AND (
      (
        NULLIF(BTRIM("province"), '') IS NULL
        OR LOWER(BTRIM("province")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
        OR NULLIF(BTRIM("city"), '') IS NULL
        OR LOWER(BTRIM("city")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
        OR NULLIF(BTRIM("district"), '') IS NULL
        OR LOWER(BTRIM("district")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
        OR NULLIF(BTRIM("subdistrict"), '') IS NULL
        OR LOWER(BTRIM("subdistrict")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', 'na', '-', '00000')
        OR NULLIF(BTRIM("street"), '') IS NULL
        OR LOWER(BTRIM("street")) IN ('', 'unknown', 'tidak diketahui', 'tanpa nomor', 'tanpa no', 'no number', 'n a', '-', '00000')
        OR LOWER(BTRIM("street")) ~ '^[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,4}$'
      )
      OR "reference_location" IS NULL
      OR (
        "reference_location" IS NOT NULL
        AND "coordinate_audit_status" IN ('MATCHED', 'MISMATCH')
      )
    );
