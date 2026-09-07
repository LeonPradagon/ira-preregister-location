import { describe, expect, it } from 'vitest';
import { applyApprovalPolicy, getCoordinateMatchScore, shouldAutoApprove } from '../../../src/modules/verification/approval-policy.js';

const base = {
  result: 'LOCATION_VALID',
  addressScore: 0.95,
  customerConfirmationStatus: 'CONFIRMED',
  enableAutoApproval: false,
  threshold: 0.9,
};

describe('automatic approval policy', () => {
  it('does not auto-approve when the single automatic approval toggle is off', () => {
    expect(shouldAutoApprove(base)).toBe(false);
  });

  it('skips the manual queue when automatic approval is enabled and the score meets the threshold', () => {
    expect(shouldAutoApprove({ ...base, enableAutoApproval: true })).toBe(true);
  });

  it('accepts the exact 90% automatic approval boundary', () => {
    expect(shouldAutoApprove({ ...base, enableAutoApproval: true, addressScore: 0.9 })).toBe(true);
  });

  it('requires customer confirmation before approving automatically', () => {
    expect(shouldAutoApprove({ ...base, enableAutoApproval: true, customerConfirmationStatus: 'PENDING' })).toBe(false);
  });

  it('never auto-approves below the hard 90% floor', () => {
    expect(shouldAutoApprove({ ...base, enableAutoApproval: true, addressScore: 0.89 })).toBe(false);
  });

  it('holds a passing result for review when it misses the automatic score floor', () => {
    expect(applyApprovalPolicy({
      ...base,
      addressScore: 0.89,
      reasonCodes: ['LOCATION_VALID'],
    })).toEqual({
      result: 'MANUAL_REVIEW',
      reasonCodes: ['AUTOMATED_VALIDATION_PASSED', 'MANUAL_REVIEW_REQUIRED'],
      autoApproved: false,
    });
  });

  it('auto-approves a precise coordinate match when reverse geocoding is unavailable', () => {
    expect(applyApprovalPolicy({
      ...base,
      enableAutoApproval: true,
      addressScore: 0,
      coordinateMatchScore: 1,
      reasonCodes: ['COORDINATE_MATCHED', 'GEOCODING_UNAVAILABLE', 'LOCATION_VALID'],
    })).toEqual({
      result: 'LOCATION_VALID',
      reasonCodes: ['COORDINATE_MATCHED', 'GEOCODING_UNAVAILABLE', 'LOCATION_VALID', 'AUTO_APPROVED'],
      autoApproved: true,
    });
  });

  it('only treats a stable GPS point inside a precise home radius as a coordinate match', () => {
    expect(getCoordinateMatchScore({
      geocodingAvailable: false,
      referencePrecision: 'HOUSE',
      distanceFromReferenceMeters: 12,
      homeRadiusMeters: 50,
      gpsAccuracyMeters: 8,
      gpsMaxAccuracyMeters: 30,
      sampleSpreadMeters: 14,
    })).toBe(1);
    expect(getCoordinateMatchScore({
      geocodingAvailable: false,
      referencePrecision: 'STREET',
      distanceFromReferenceMeters: 12,
      homeRadiusMeters: 50,
      gpsAccuracyMeters: 8,
      gpsMaxAccuracyMeters: 30,
      sampleSpreadMeters: 14,
    })).toBe(0);
  });

  it('auto-approves a confirmed 91% address match with only non-blocking reference warnings', () => {
    expect(applyApprovalPolicy({
      ...base,
      enableAutoApproval: true,
      result: 'MANUAL_REVIEW',
      addressScore: 0.91,
      reasonCodes: ['REFERENCE_LOCATION_MISSING', 'REFERENCE_LOCATION_NOT_PRECISE', 'STREET_VARIATION', 'MANUAL_REVIEW_REQUIRED'],
    })).toEqual({
      result: 'LOCATION_VALID',
      reasonCodes: ['REFERENCE_LOCATION_MISSING', 'REFERENCE_LOCATION_NOT_PRECISE', 'STREET_VARIATION', 'AUTO_APPROVED'],
      autoApproved: true,
    });
  });

  it('does not auto-approve a high score when the engine reports a hard mismatch', () => {
    expect(applyApprovalPolicy({
      ...base,
      enableAutoApproval: true,
      result: 'MANUAL_REVIEW',
      addressScore: 0.95,
      reasonCodes: ['STREET_MISMATCH', 'MANUAL_REVIEW_REQUIRED'],
    })).toEqual({
      result: 'MANUAL_REVIEW',
      reasonCodes: ['STREET_MISMATCH', 'MANUAL_REVIEW_REQUIRED'],
      autoApproved: false,
    });
  });
});
