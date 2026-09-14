import { or, sql, type SQL } from 'drizzle-orm';

export const campaignRecipientReservationStatuses = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'READ',
] as const;

/**
 * Customers without a reference coordinate are the primary targets of the
 * location-verification flow. Coverage filters must not hide them, because
 * their FWA/FTTH values may be unknown when they are added manually.
 */
export const campaignCoverageFilterWithMissingReferenceLocation = (coverageFilter?: SQL) =>
  coverageFilter
    ? or(
        sql`exists (
          select 1
          from customer_addresses coverage_address
          where coverage_address.customer_id = customers.id
            and coverage_address.is_active = true
            and coverage_address.reference_location is null
        )`,
        coverageFilter,
      )
    : undefined;

export const selectCampaignTargetIds = (candidateIds: readonly string[], dailySendLimit: number) =>
  candidateIds.slice(0, dailySendLimit);

/**
 * Campaign targets are a snapshot. Do not re-apply current customer eligibility
 * rules while materializing a campaign that already stored explicit IDs.
 */
export const selectMaterializationTargetIds = (targetIds: readonly string[], cursor?: string | null) =>
  cursor ? targetIds.filter((id) => id > cursor) : [...targetIds];

export const campaignNeedsMaterialization = (
  materializationComplete: boolean,
  materializedCount: number,
  targetCount: number,
) => !materializationComplete || materializedCount < targetCount;
