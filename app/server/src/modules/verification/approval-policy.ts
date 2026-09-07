export interface AutoApprovalPolicyInput {
  result: string;
  addressScore: number;
  coordinateMatchScore?: number;
  customerConfirmationStatus: string;
  enableAutoApproval: boolean;
  threshold: number;
}

export interface ApprovalPolicyDecision {
  result: string;
  reasonCodes: string[];
  autoApproved: boolean;
}

const autoApprovalBlockingReasonCodes = new Set([
  'LOW_GPS_ACCURACY',
  'GPS_SAMPLE_INCONSISTENT',
  'PROVINCE_MISMATCH',
  'CITY_MISMATCH',
  'DISTRICT_MISMATCH',
  'SUBDISTRICT_MISMATCH',
  'STREET_MISMATCH',
  'HOUSE_NUMBER_MISMATCH',
  'ADDRESS_INCOMPLETE',
  'HOME_RADIUS_EXCEEDED',
  'GEOCODING_UNAVAILABLE',
]);

/**
 * Automatic approval has one source of truth: the automatic-approval setting.
 * Manual review remains the safety fallback whenever that setting is off or
 * the result does not meet the hard 90% score floor.
 */
export function shouldAutoApprove(input: AutoApprovalPolicyInput): boolean {
  const matchScore = Math.max(input.addressScore, input.coordinateMatchScore ?? 0);
  return input.enableAutoApproval
    && input.customerConfirmationStatus === 'CONFIRMED'
    && input.result === 'LOCATION_VALID'
    && matchScore >= Math.max(0.9, input.threshold);
}

export interface CoordinateMatchInput {
  geocodingAvailable: boolean;
  referencePrecision: string;
  distanceFromReferenceMeters: number | null;
  homeRadiusMeters: number;
  gpsAccuracyMeters: number;
  gpsMaxAccuracyMeters: number;
  sampleSpreadMeters: number;
}

/**
 * A precise master coordinate is enough to establish a location match when
 * the reverse-geocoder is temporarily unavailable. Unstable or approximate
 * coordinates must still go through the normal review path.
 */
export function getCoordinateMatchScore(input: CoordinateMatchInput): number {
  const preciseReference = ['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(input.referencePrecision);
  const usableGps = input.gpsAccuracyMeters <= input.gpsMaxAccuracyMeters && input.sampleSpreadMeters <= 100;
  const insideHomeRadius = input.distanceFromReferenceMeters != null && input.distanceFromReferenceMeters <= input.homeRadiusMeters;
  return !input.geocodingAvailable && preciseReference && usableGps && insideHomeRadius ? 1 : 0;
}

const canAutoApproveEngineResult = (result: string, reasonCodes: string[]): boolean =>
  result === 'LOCATION_VALID'
  || (result === 'MANUAL_REVIEW' && !reasonCodes.some((reasonCode) => autoApprovalBlockingReasonCodes.has(reasonCode)));

/**
 * Convert a passing engine result into the final approval outcome. A passing
 * engine result that cannot be auto-approved must stay held for review rather
 * than being marked as verified accidentally.
 */
export function applyApprovalPolicy(input: AutoApprovalPolicyInput & { reasonCodes: string[] }): ApprovalPolicyDecision {
  const engineResultCanAutoApprove = canAutoApproveEngineResult(input.result, input.reasonCodes);
  if (engineResultCanAutoApprove && shouldAutoApprove({ ...input, result: 'LOCATION_VALID' })) {
    return {
      result: 'LOCATION_VALID',
      reasonCodes: [...input.reasonCodes.filter((reasonCode) => !['AUTOMATED_VALIDATION_PASSED', 'MANUAL_REVIEW_REQUIRED'].includes(reasonCode)), 'AUTO_APPROVED'],
      autoApproved: true,
    };
  }

  return {
    result: input.result === 'LOCATION_VALID' ? 'MANUAL_REVIEW' : input.result,
    reasonCodes: input.result === 'LOCATION_VALID'
      ? [...input.reasonCodes.filter((reasonCode) => reasonCode !== 'LOCATION_VALID'), 'AUTOMATED_VALIDATION_PASSED', 'MANUAL_REVIEW_REQUIRED']
      : input.reasonCodes,
    autoApproved: false,
  };
}
