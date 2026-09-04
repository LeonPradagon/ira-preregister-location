import { describe, expect, it } from 'vitest';
import { shouldAutoApprove } from '../../../src/modules/verification/approval-policy.js';

const base = {
  result: 'LOCATION_VALID',
  addressScore: 0.95,
  customerConfirmationStatus: 'CONFIRMED',
  enableManualReview: true,
  enableAutoApproval: false,
  threshold: 0.9,
};

describe('automatic approval policy', () => {
  it('uses the automatic path when manual review is disabled', () => {
    expect(shouldAutoApprove({ ...base, enableManualReview: false })).toBe(true);
  });

  it('keeps a confirmed passing result in manual review when manual mode is enabled', () => {
    expect(shouldAutoApprove(base)).toBe(false);
  });

  it('never auto-approves below the hard 90% floor', () => {
    expect(shouldAutoApprove({ ...base, enableManualReview: false, addressScore: 0.89 })).toBe(false);
  });
});
