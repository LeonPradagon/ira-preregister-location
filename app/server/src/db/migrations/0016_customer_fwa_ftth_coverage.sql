ALTER TABLE customers ADD COLUMN IF NOT EXISTS coverage_fwa_status varchar(64);
-- statement-breakpoint
ALTER TABLE customers ADD COLUMN IF NOT EXISTS coverage_ftth_status varchar(64);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS customers_coverage_fwa_status_idx ON customers (coverage_fwa_status);
-- statement-breakpoint
CREATE INDEX IF NOT EXISTS customers_coverage_ftth_status_idx ON customers (coverage_ftth_status);
