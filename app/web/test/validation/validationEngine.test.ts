import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsDeepLink,
  calculateGeodesicDistanceMeters,
  evaluateBestGpsSample,
  formatAddressForDisplay,
  isIncompleteAddress,
  isValidCoordinate,
} from '../../src/lib/validationEngine';

const samples = [
  { latitude: -6.233812, longitude: 106.809599, accuracyMeters: 12, capturedAt: '2026-08-29T04:25:00Z' },
  { latitude: -6.23382, longitude: 106.80959, accuracyMeters: 14, capturedAt: '2026-08-29T04:25:01Z' },
  { latitude: -6.233805, longitude: 106.809604, accuracyMeters: 13, capturedAt: '2026-08-29T04:25:02Z' },
];

describe('GPS evidence helpers', () => {
  it('validates coordinate ranges and positive accuracy', () => {
    expect(isValidCoordinate({ latitude: -6, longitude: 106, accuracyMeters: 12 })).toBe(true);
    expect(isValidCoordinate({ latitude: 91, longitude: 106, accuracyMeters: 12 })).toBe(false);
    expect(isValidCoordinate({ latitude: -6, longitude: 106, accuracyMeters: 0 })).toBe(false);
  });

  it('selects the most accurate sample from a valid capture set', () => {
    expect(evaluateBestGpsSample(samples).bestSample.accuracyMeters).toBe(12);
    expect(evaluateBestGpsSample(samples).isConsistent).toBe(true);
    expect(() => evaluateBestGpsSample(samples.slice(0, 2))).toThrow();
    expect(() => evaluateBestGpsSample([...samples, ...samples])).toThrow();
  });

  it('calculates distance in meters and preserves latitude/longitude order in links', () => {
    expect(calculateGeodesicDistanceMeters({ latitude: -6, longitude: 106 }, { latitude: -6, longitude: 106 })).toBe(0);
    expect(buildGoogleMapsDeepLink(-6.208812, 106.845599)).toContain('query=-6.208812,106.845599');
  });

  it('removes standalone and concatenated Plus Codes from displayed addresses', () => {
    expect(formatAddressForDisplay('MJ42+JJP, Jl. Kp. Kandang, Mekarwangi, Kec. Cisauk')).toBe(
      'Jl. Kp. Kandang, Mekarwangi, Kec. Cisauk',
    );
    expect(formatAddressForDisplay('WC35+H22Jl. Delik Sari, Pudakpayung')).toBe('Jl. Delik Sari, Pudakpayung');
  });

  it('does not require a postal code when street and house number are present', () => {
    expect(isIncompleteAddress({ street: 'Jl. Mawar', houseNumber: '21', postalCode: '00000' })).toBe(false);
    expect(isIncompleteAddress({ street: 'Jl. Mawar', houseNumber: '21', postalCode: '' })).toBe(false);
    expect(isIncompleteAddress({ street: 'Jl. Mawar', houseNumber: '', postalCode: '00000' })).toBe(false);
    expect(isIncompleteAddress({ street: '', houseNumber: '21', postalCode: '00000' })).toBe(true);
  });
});
