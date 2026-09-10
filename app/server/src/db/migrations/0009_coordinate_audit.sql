ALTER TABLE "customer_addresses"
  ADD COLUMN IF NOT EXISTS "coordinate_audit_status" varchar(16) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "coordinate_audit_reason" text,
  ADD COLUMN IF NOT EXISTS "coordinate_audit_evidence" jsonb,
  ADD COLUMN IF NOT EXISTS "coordinate_audit_confidence" numeric(4, 3),
  ADD COLUMN IF NOT EXISTS "coordinate_audited_at" timestamptz;

CREATE INDEX IF NOT EXISTS "customer_addresses_coordinate_audit_status_idx"
  ON "customer_addresses" ("coordinate_audit_status");
