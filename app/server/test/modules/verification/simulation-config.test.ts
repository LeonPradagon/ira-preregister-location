import { describe, expect, it } from 'vitest';
import { buildVerificationSimulationConfig } from '../../../src/modules/verification/simulation-config.js';

describe('verification simulation configuration', () => {
  it('passes the enabled automatic approval rule to the customer simulation', () => {
    expect(buildVerificationSimulationConfig({
      HOME_RADIUS_METERS: 50,
      GPS_MAX_ACCURACY_METERS: 30,
      ENABLE_MANUAL_REVIEW: true,
      ENABLE_AUTO_APPROVAL: true,
      AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD: 0.9,
    })).toEqual({
      homeRadiusMeters: 50,
      gpsMaxAccuracyMeters: 30,
      manualReview: true,
      autoApprovalEnabled: true,
      autoApprovalScoreThreshold: 0.9,
    });
  });
});
