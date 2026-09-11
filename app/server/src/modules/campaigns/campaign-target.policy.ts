export const campaignRecipientReservationStatuses = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'READ',
] as const;

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
