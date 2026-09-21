import { describe, expect, it } from 'vitest';
import { getManualReviewCaseKeys } from '../../src/lib/manualReviewCases';

describe('getManualReviewCaseKeys', () => {
  it('explains a weak GPS signal and inconsistent samples', () => {
    expect(getManualReviewCaseKeys('WAITING_FOR_HOME', ['LOW_GPS_ACCURACY', 'GPS_SAMPLE_INCONSISTENT'])).toEqual([
      'GPS_ACCURACY',
      'GPS_INCONSISTENT',
    ]);
  });

  it('separates an address mismatch from a radius failure', () => {
    expect(getManualReviewCaseKeys('LOCATION_MISMATCH', ['HOUSE_NUMBER_MISMATCH'])).toEqual(['ADDRESS_MISMATCH']);
    expect(getManualReviewCaseKeys('LOCATION_MISMATCH', ['HOME_RADIUS_EXCEEDED'])).toEqual([
      'LOCATION_OUTSIDE_RADIUS',
    ]);
  });

  it('falls back to a review-required case when no reason code is available', () => {
    expect(getManualReviewCaseKeys('MANUAL_REVIEW')).toEqual(['REVIEW_REQUIRED']);
  });
});
