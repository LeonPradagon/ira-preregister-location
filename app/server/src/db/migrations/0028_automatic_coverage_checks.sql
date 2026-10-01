ALTER TABLE "coverage_check_batches"
  ALTER COLUMN "requested_by" DROP NOT NULL;

ALTER TABLE "coverage_checks"
  ALTER COLUMN "requested_by" DROP NOT NULL;
