import { describe, expect, it } from 'vitest';
import { decideValidation, AddressEvidence, ReverseGeocodeEvidence } from '../../../src/modules/validation/engine.js';
import { GpsSample } from '../../../src/common/contracts.js';

const address: AddressEvidence = {
  id: 'address-1', province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago',
  street: 'Jl. Ir H Juanda', houseNumber: '10', referenceLatitude: -6.884, referenceLongitude: 107.613,
  referencePrecision: 'HOUSE',
};

const reverseGeocode: ReverseGeocodeEvidence = {
  province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago',
  street: 'Jalan Ir H Juanda', houseNumber: '10', formattedAddress: 'Jalan Ir H Juanda No. 10, Bandung',
};

const sample = (latitude: number, longitude: number, accuracyMeters = 10, offset = 0): GpsSample => ({
  latitude, longitude, accuracyMeters, capturedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, offset)).toISOString(),
});

const config = { gpsMaxAccuracyMeters: 30, homeRadiusMeters: 50, streetMatchThreshold: 0.9, addressScoreThreshold: 0.9 };

describe('server validation engine', () => {
  it('accepts a precise, accurate and address-matching capture', () => {
    const decision = decideValidation([
      sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2),
    ], address, reverseGeocode, config);
    expect(decision.result).toBe('LOCATION_VALID');
    expect(decision.reasonCodes).toContain('LOCATION_VALID');
    expect(decision.sampleSpreadMeters).toBeLessThan(50);
  });

  it('routes samples with excessive spread to manual review', () => {
    const decision = decideValidation([
      sample(-6.884, 107.613), sample(-6.8855, 107.613, 12, 1), sample(-6.884, 107.6145, 14, 2),
    ], address, reverseGeocode, config);
    expect(decision.result).toBe('MANUAL_REVIEW');
    expect(decision.reasonCodes).toContain('GPS_SAMPLE_INCONSISTENT');
  });

  it('returns low accuracy before applying address/radius rules', () => {
    const decision = decideValidation([
      sample(-6.884, 107.613, 60), sample(-6.88401, 107.61301, 65, 1), sample(-6.88399, 107.61299, 70, 2),
    ], address, reverseGeocode, config);
    expect(decision.result).toBe('LOW_GPS_ACCURACY');
    expect(decision.reasonCodes).toContain('LOW_GPS_ACCURACY');
  });

  it('enforces the street match threshold as a hard rule', () => {
    const decision = decideValidation([
      sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2),
    ], address, { ...reverseGeocode, street: 'Jalan Dipatiukur' }, config);
    expect(decision.streetScore).toBeLessThan(config.streetMatchThreshold);
    expect(decision.result).not.toBe('LOCATION_VALID');
    expect(decision.reasonCodes).toContain('STREET_MISMATCH');
  });

  it('does not invent a distance or approve a capture when the reference coordinate is null', () => {
    const decision = decideValidation([
      sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2),
    ], { ...address, referenceLatitude: null, referenceLongitude: null }, reverseGeocode, config);
    expect(decision.result).toBe('MANUAL_REVIEW');
    expect(decision.distanceFromReferenceMeters).toBeNull();
    expect(decision.reasonCodes).toContain('REFERENCE_LOCATION_MISSING');
  });
});
