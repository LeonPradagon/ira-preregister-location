import { describe, expect, it } from 'vitest';
import {
  campaignRecipientReservationStatuses,
  campaignNeedsMaterialization,
  selectCampaignTargetIds,
  selectMaterializationTargetIds,
} from '../../../src/modules/campaigns/campaign-target.policy.js';

describe('campaign target policy', () => {
  it('caps select-all targets at the configured daily send limit', () => {
    const candidateIds = Array.from({ length: 1_000_000 }, (_, index) => `customer-${index}`);

    expect(selectCampaignTargetIds(candidateIds, 500)).toHaveLength(500);
    expect(selectCampaignTargetIds(candidateIds, 500)).toEqual(candidateIds.slice(0, 500));
  });

  it('reserves active and successfully sent campaign recipients but allows failed retries', () => {
    expect(campaignRecipientReservationStatuses).toEqual([
      'PENDING',
      'PROCESSING',
      'SENT',
      'DELIVERED',
      'READ',
    ]);
  });

  it('keeps selected campaign recipients when materialization advances its cursor', () => {
    expect(selectMaterializationTargetIds(['customer-a', 'customer-b', 'customer-c'], 'customer-a')).toEqual([
      'customer-b',
      'customer-c',
    ]);
  });

  it('recognizes an incomplete materialization even when its completion flag is stale', () => {
    expect(campaignNeedsMaterialization(true, 0, 1)).toBe(true);
    expect(campaignNeedsMaterialization(true, 1, 1)).toBe(false);
  });
});
