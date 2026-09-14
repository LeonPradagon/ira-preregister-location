import { describe, expect, it } from 'vitest';
import {
  campaignRecipientReservationStatuses,
  campaignCoverageFilterWithMissingReferenceLocation,
  campaignNeedsMaterialization,
  selectCampaignTargetIds,
  selectMaterializationTargetIds,
} from '../../../src/modules/campaigns/campaign-target.policy.js';
import { eq } from 'drizzle-orm';
import { customers } from '../../../src/db/schema/index.js';

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

  it('keeps customers without coordinates eligible even when coverage filters are selected', () => {
    const filter = campaignCoverageFilterWithMissingReferenceLocation(eq(customers.coverageFwaStatus, 'Not Coverage'));

    expect(filter).toBeDefined();
    const serialized = JSON.stringify(filter, (key, value) => (key === 'table' ? undefined : value));
    expect(serialized).toContain('reference_location is null');
    expect(serialized).toContain('coverage_fwa_status');
  });
});
