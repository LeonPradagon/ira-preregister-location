export const campaignRecipientReservationStatuses = [
  'PENDING',
  'PROCESSING',
  'SENT',
  'DELIVERED',
  'READ',
] as const;

export const selectCampaignTargetIds = (candidateIds: readonly string[], dailySendLimit: number) =>
  candidateIds.slice(0, dailySendLimit);
