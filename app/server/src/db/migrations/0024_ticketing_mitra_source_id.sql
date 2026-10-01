ALTER TABLE "ticketing_mitra" ADD COLUMN IF NOT EXISTS "source_id" uuid DEFAULT gen_random_uuid();
-- statement-breakpoint
ALTER TABLE "ticketing_mitra" DROP CONSTRAINT IF EXISTS "ticketing_mitra_pkey";
-- statement-breakpoint
ALTER TABLE "ticketing_mitra" ALTER COLUMN "source_id" SET NOT NULL;
-- statement-breakpoint
ALTER TABLE "ticketing_mitra" ALTER COLUMN "mitra_code" DROP NOT NULL;
-- statement-breakpoint
ALTER TABLE "ticketing_mitra" ADD CONSTRAINT "ticketing_mitra_pkey" PRIMARY KEY ("source_id");
-- statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticketing_mitra_code_unique_idx"
  ON "ticketing_mitra" ("mitra_code") WHERE "mitra_code" IS NOT NULL;
