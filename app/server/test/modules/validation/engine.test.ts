import { describe, expect, it } from 'vitest';
import {
  decideValidation,
  AddressEvidence,
  ReverseGeocodeEvidence,
  isAddressIncomplete,
} from '../../../src/modules/validation/engine.js';
import { GpsSample } from '../../../src/common/contracts.js';

const address: AddressEvidence = {
  id: 'address-1',
  province: 'Jawa Barat',
  city: 'Bandung',
  district: 'Coblong',
  subdistrict: 'Dago',
  street: 'Jl. Ir H Juanda',
  houseNumber: '10',
  postalCode: '40135',
  referenceLatitude: -6.884,
  referenceLongitude: 107.613,
  referencePrecision: 'HOUSE',
};

const reverseGeocode: ReverseGeocodeEvidence = {
  province: 'Jawa Barat',
  city: 'Bandung',
  district: 'Coblong',
  subdistrict: 'Dago',
  street: 'Jalan Ir H Juanda',
  houseNumber: '10',
  formattedAddress: 'Jalan Ir H Juanda No. 10, Bandung',
};

const sample = (latitude: number, longitude: number, accuracyMeters = 10, offset = 0): GpsSample => ({
  latitude,
  longitude,
  accuracyMeters,
  capturedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, offset)).toISOString(),
});

const config = {
  gpsMaxAccuracyMeters: 30,
  homeRadiusMeters: 50,
  streetMatchThreshold: 0.9,
  addressScoreThreshold: 0.9,
};

describe('server validation engine', () => {
  it('identifies missing and plus-code-only streets as requiring correction', () => {
    expect(isAddressIncomplete({ ...address, street: '' })).toBe(true);
    expect(isAddressIncomplete({ ...address, street: '8H3F+6Q' })).toBe(true);
    expect(isAddressIncomplete(address)).toBe(false);
  });

  it('does not require a postal code when the structured address is complete', () => {
    expect(isAddressIncomplete({ ...address, postalCode: '00000' })).toBe(false);
    expect(isAddressIncomplete({ ...address, postalCode: '' })).toBe(false);
    expect(isAddressIncomplete({ ...address, houseNumber: '' })).toBe(false);
    expect(isAddressIncomplete({ ...address, houseNumber: 'UNKNOWN' })).toBe(false);
    expect(isAddressIncomplete({ ...address, street: '' })).toBe(true);
  });

  it('accepts a precise, accurate and address-matching capture', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2)],
      address,
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('LOCATION_VALID');
    expect(decision.reasonCodes).toContain('LOCATION_VALID');
    expect(decision.sampleSpreadMeters).toBeLessThan(50);
  });

  it('routes samples with excessive spread to manual review', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613), sample(-6.8855, 107.613, 12, 1), sample(-6.884, 107.6145, 14, 2)],
      address,
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('WAITING_FOR_HOME');
    expect(decision.reasonCodes).toContain('GPS_SAMPLE_INCONSISTENT');
    expect(decision.reasonCodes).toContain('WAITING_FOR_HOME');
  });

  it('returns low accuracy before applying address/radius rules', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613, 60), sample(-6.88401, 107.61301, 65, 1), sample(-6.88399, 107.61299, 70, 2)],
      address,
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('WAITING_FOR_HOME');
    expect(decision.reasonCodes).toContain('LOW_GPS_ACCURACY');
    expect(decision.reasonCodes).toContain('WAITING_FOR_HOME');
  });

  it('enforces the street match threshold as a hard rule', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2)],
      address,
      { ...reverseGeocode, street: 'Jalan Dipatiukur' },
      config,
    );
    expect(decision.streetScore).toBeLessThan(config.streetMatchThreshold);
    expect(decision.result).not.toBe('LOCATION_VALID');
    expect(decision.reasonCodes).toContain('STREET_MISMATCH');
  });

  it('does not invent a distance when the reference coordinate is null', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2)],
      { ...address, referenceLatitude: null, referenceLongitude: null },
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('LOCATION_VALID');
    expect(decision.distanceFromReferenceMeters).toBeNull();
    expect(decision.reasonCodes).toContain('REFERENCE_LOCATION_MISSING');
  });

  it('normalizes Indonesian administrative aliases on their canonical levels', () => {
    const decision = decideValidation(
      [sample(-6.2, 106.784), sample(-6.20001, 106.78401, 12, 1), sample(-6.19999, 106.78399, 14, 2)],
      {
        ...address,
        province: 'Daerah Khusus Ibukota Jakarta',
        city: 'Kota Administrasi Jakarta Barat',
        district: 'Pal Merah',
        subdistrict: 'Palmerah',
        street: 'JL KH Syahdan',
        houseNumber: 'No.10A',
        referenceLatitude: -6.2,
        referenceLongitude: 106.784,
      },
      {
        province: 'DKI Jakarta',
        city: 'Jakarta Barat',
        district: 'Palmerah',
        subdistrict: 'Palmerah',
        street: 'Jalan KH. Syahdan',
        formattedAddress: 'Jalan KH. Syahdan, Palmerah, Jakarta Barat',
      },
      config,
    );
    expect(decision.provinceMatch).toBe(true);
    expect(decision.cityMatch).toBe(true);
    expect(decision.districtMatch).toBe(true);
    expect(decision.subdistrictMatch).toBe(true);
    expect(decision.result).toBe('LOCATION_VALID');
  });

  it('does not treat shifted administrative levels as a match', () => {
    const decision = decideValidation(
      [sample(-6.2, 106.784), sample(-6.20001, 106.78401, 12, 1), sample(-6.19999, 106.78399, 14, 2)],
      {
        ...address,
        province: 'Daerah Khusus Ibukota Jakarta',
        city: 'Kota Administrasi Jakarta Utara',
        district: 'Penjaringan',
        subdistrict: 'Kamal Muara',
        street: 'Jalan Kamal Muara VI',
        referenceLatitude: -6.2,
        referenceLongitude: 106.784,
      },
      {
        province: '',
        city: 'Daerah Khusus Ibukota Jakarta',
        district: 'Jakarta Utara',
        subdistrict: 'Penjaringan',
        street: 'Jalan Kamal Muara VI',
        formattedAddress: 'Jalan Kamal Muara VI, Penjaringan, Jakarta Utara',
      },
      config,
    );
    expect(decision.cityMatch).toBe(false);
    expect(decision.districtMatch).toBe(false);
    expect(decision.subdistrictMatch).toBe(false);
    expect(decision.result).toBe('LOCATION_MISMATCH');
  });

  it('treats a similar street name as a variation when administrative levels match', () => {
    const decision = decideValidation(
      [sample(-6.127123, 106.744726), sample(-6.127124, 106.744727, 12, 1), sample(-6.127122, 106.744725, 14, 2)],
      {
        ...address,
        province: 'DKI Jakarta',
        city: 'Kota Administrasi Jakarta Utara',
        district: 'Penjaringan',
        subdistrict: 'Kamal Muara',
        street: 'Jalan Kamal Muara 7',
        houseNumber: '6',
        postalCode: '14470',
        referenceLatitude: null,
        referenceLongitude: null,
        referencePrecision: 'UNKNOWN',
      },
      {
        province: 'DKI Jakarta',
        city: 'Jakarta Utara',
        district: 'Penjaringan',
        subdistrict: 'Kamal Muara',
        street: 'Jalan Kamal Muara VI',
        formattedAddress: 'Jalan Kamal Muara VI, Kamal Muara',
      },
      config,
    );
    expect(decision.provinceMatch).toBe(true);
    expect(decision.cityMatch).toBe(true);
    expect(decision.districtMatch).toBe(true);
    expect(decision.subdistrictMatch).toBe(true);
    expect(decision.streetScore).toBe(0.75);
    expect(decision.reasonCodes).toContain('STREET_VARIATION');
    expect(decision.reasonCodes).not.toContain('STREET_MISMATCH');
    expect(decision.result).toBe('MANUAL_REVIEW');
  });

  it('routes a complete address mismatch to mismatch even without a master coordinate', () => {
    const decision = decideValidation(
      [sample(-6.2, 106.784), sample(-6.20001, 106.78401, 12, 1), sample(-6.19999, 106.78399, 14, 2)],
      { ...address, referenceLatitude: null, referenceLongitude: null, referencePrecision: 'UNKNOWN' },
      {
        province: 'Daerah Khusus Ibukota Jakarta',
        city: 'Jakarta Barat',
        district: 'Palmerah',
        subdistrict: 'Palmerah',
        street: 'Jalan KH Syahdan',
        formattedAddress: 'Jalan KH Syahdan, Palmerah',
      },
      config,
    );
    expect(decision.result).toBe('LOCATION_MISMATCH');
    expect(decision.reasonCodes).toContain('DISTRICT_MISMATCH');
    expect(decision.reasonCodes).toContain('STREET_MISMATCH');
    expect(decision.reasonCodes).not.toContain('MANUAL_REVIEW_REQUIRED');
  });

  it('routes a GPS point outside the home radius to mismatch before address review', () => {
    const decision = decideValidation(
      [sample(-6.88, 107.613), sample(-6.88001, 107.61301, 12, 1), sample(-6.87999, 107.61299, 14, 2)],
      { ...address, referencePrecision: 'HOUSE' },
      reverseGeocode,
      config,
    );
    expect(decision.distanceFromReferenceMeters).toBeGreaterThan(config.homeRadiusMeters);
    expect(decision.result).toBe('LOCATION_MISMATCH');
    expect(decision.reasonCodes).toContain('HOME_RADIUS_EXCEEDED');
    expect(decision.reasonCodes).not.toContain('MANUAL_REVIEW_REQUIRED');
  });

  it('accepts a matching address when its reference point is only street-level', () => {
    const decision = decideValidation(
      [sample(-6.8835, 107.613), sample(-6.88351, 107.61301, 12, 1), sample(-6.88349, 107.61299, 14, 2)],
      { ...address, referencePrecision: 'STREET' },
      reverseGeocode,
      config,
    );
    expect(decision.distanceFromReferenceMeters).toBeGreaterThan(config.homeRadiusMeters);
    expect(decision.addressScore).toBeGreaterThanOrEqual(config.addressScoreThreshold);
    expect(decision.result).toBe('LOCATION_VALID');
    expect(decision.reasonCodes).not.toContain('HOME_RADIUS_EXCEEDED');
  });

  it('asks the customer to retry before reviewing an unreferenced address when GPS is weak', () => {
    const decision = decideValidation(
      [sample(-6.2, 106.784, 35), sample(-6.20001, 106.78401, 36, 1), sample(-6.19999, 106.78399, 37, 2)],
      {
        ...address,
        street: '',
        postalCode: '00000',
        referenceLatitude: null,
        referenceLongitude: null,
        referencePrecision: 'UNKNOWN',
      },
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('WAITING_FOR_HOME');
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        'LOW_GPS_ACCURACY',
        'REFERENCE_LOCATION_MISSING',
        'ADDRESS_INCOMPLETE',
        'WAITING_FOR_HOME',
      ]),
    );
  });

  it('routes incomplete addresses to manual review even when GPS and reference match', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613), sample(-6.88401, 107.61301, 12, 1), sample(-6.88399, 107.61299, 14, 2)],
      { ...address, street: '', postalCode: '00000' },
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('MANUAL_REVIEW');
    expect(decision.reasonCodes).toContain('ADDRESS_INCOMPLETE');
  });

  it('asks the customer to retry when GPS is weak even if the address also needs review', () => {
    const decision = decideValidation(
      [sample(-6.884, 107.613, 60), sample(-6.88401, 107.61301, 65, 1), sample(-6.88399, 107.61299, 70, 2)],
      { ...address, street: '', postalCode: '00000', referencePrecision: 'UNKNOWN' },
      reverseGeocode,
      config,
    );
    expect(decision.result).toBe('WAITING_FOR_HOME');
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining(['LOW_GPS_ACCURACY', 'ADDRESS_INCOMPLETE', 'WAITING_FOR_HOME']),
    );
    expect(decision.reasonCodes).not.toContain('MANUAL_REVIEW_REQUIRED');
  });
});
