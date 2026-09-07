import type { RuntimeValidationConfig } from '../../config/validation-config.service.js';

export interface VerificationSimulationConfig {
  homeRadiusMeters: number;
  gpsMaxAccuracyMeters: number;
  manualReview: boolean;
  autoApprovalEnabled: boolean;
  autoApprovalScoreThreshold: number;
}

type SimulationConfigSource = Pick<
  RuntimeValidationConfig,
  'HOME_RADIUS_METERS' | 'GPS_MAX_ACCURACY_METERS' | 'ENABLE_MANUAL_REVIEW' | 'ENABLE_AUTO_APPROVAL' | 'AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD'
>;

/**
 * Keep the configuration embedded in an E2E verification link in one place.
 * The automatic-approval fields are intentionally included in this payload
 * because the customer simulation runs its decision locally in the browser.
 */
export function buildVerificationSimulationConfig(config: SimulationConfigSource): VerificationSimulationConfig {
  return {
    homeRadiusMeters: config.HOME_RADIUS_METERS,
    gpsMaxAccuracyMeters: config.GPS_MAX_ACCURACY_METERS,
    manualReview: config.ENABLE_MANUAL_REVIEW,
    autoApprovalEnabled: config.ENABLE_AUTO_APPROVAL,
    autoApprovalScoreThreshold: Math.max(0.9, config.AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD),
  };
}
