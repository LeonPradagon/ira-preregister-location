import { describe, expect, it } from 'vitest';
import { INITIAL_ADDRESSES, INITIAL_VALIDATION_CONFIG } from './mockData';
import {
  buildGoogleMapsDeepLink,
  calculateTokenSimilarity,
  evaluateBestGpsSample,
  isValidCoordinate,
  normalizeAddressText,
  runValidationDecisionEngine,
} from './validationEngine';

const address = INITIAL_ADDRESSES[0];
const samplesAtHome = [
  { latitude: -6.233812, longitude: 106.809599, accuracyMeters: 12, capturedAt: '2026-08-29T04:25:00Z' },
  { latitude: -6.23382, longitude: 106.80959, accuracyMeters: 14, capturedAt: '2026-08-29T04:25:01Z' },
  { latitude: -6.233805, longitude: 106.809604, accuracyMeters: 13, capturedAt: '2026-08-29T04:25:02Z' },
];

const reverseGeocode = {
  province: address.province,
  city: address.city,
  district: address.district,
  subdistrict: address.subdistrict,
  street: address.street,
  houseNumber: address.houseNumber,
  postalCode: address.postalCode,
  formattedAddress: address.rawAddress,
};

describe('validation engine', () => {
  it('normalizes Indonesian address aliases', () => {
    expect(normalizeAddressText('Jl. Jend. Sudirman')).toBe('jalan jenderal sudirman');
    expect(calculateTokenSimilarity('Jl. Jend. Sudirman', 'Jalan Jenderal Sudirman')).toBe(1);
  });

  it('validates coordinate ranges and positive accuracy', () => {
    expect(isValidCoordinate({ latitude: -6, longitude: 106, accuracyMeters: 12 })).toBe(true);
    expect(isValidCoordinate({ latitude: 91, longitude: 106, accuracyMeters: 12 })).toBe(false);
    expect(isValidCoordinate({ latitude: -6, longitude: 106, accuracyMeters: 0 })).toBe(false);
  });

  it('requires 3 to 5 valid GPS samples', () => {
    expect(evaluateBestGpsSample(samplesAtHome).bestSample.accuracyMeters).toBe(12);
    expect(() => evaluateBestGpsSample(samplesAtHome.slice(0, 2))).toThrow();
    expect(() => evaluateBestGpsSample([...samplesAtHome, ...samplesAtHome])).toThrow();
  });

  it('returns LOCATION_VALID only when hard rules and weighted address rules pass', () => {
    const result = runValidationDecisionEngine(
      samplesAtHome,
      address,
      reverseGeocode,
      INITIAL_VALIDATION_CONFIG,
      'ses-test',
      'cap-test'
    );
    expect(result.result).toBe('LOCATION_VALID');
    expect(result.capturedLocation.latitude).toBe(samplesAtHome[0].latitude);
    expect(result.capturedLocation.longitude).toBe(samplesAtHome[0].longitude);
  });

  it('blocks low GPS accuracy without classifying it as an address mismatch', () => {
    const result = runValidationDecisionEngine(
      samplesAtHome.map((sample) => ({ ...sample, accuracyMeters: 68 })),
      address,
      reverseGeocode,
      INITIAL_VALIDATION_CONFIG,
      'ses-test',
      'cap-test'
    );
    expect(result.result).toBe('LOW_GPS_ACCURACY');
  });

  it('blocks points outside the configured home radius', () => {
    const result = runValidationDecisionEngine(
      samplesAtHome.map((sample) => ({ ...sample, latitude: -6.215432, longitude: 106.819876 })),
      address,
      reverseGeocode,
      INITIAL_VALIDATION_CONFIG,
      'ses-test',
      'cap-test'
    );
    expect(result.result).toBe('LOCATION_MISMATCH');
  });

  it('routes imprecise references to manual review', () => {
    const result = runValidationDecisionEngine(
      samplesAtHome,
      { ...address, referencePrecision: 'STREET' },
      reverseGeocode,
      INITIAL_VALIDATION_CONFIG,
      'ses-test',
      'cap-test'
    );
    expect(result.result).toBe('MANUAL_REVIEW');
    expect(result.reasonCodes).toContain('REFERENCE_LOCATION_NOT_PRECISE');
  });

  it('keeps latitude before longitude in Google Maps deep links', () => {
    expect(buildGoogleMapsDeepLink(-6.208812, 106.845599)).toContain('query=-6.208812,106.845599');
  });
});
