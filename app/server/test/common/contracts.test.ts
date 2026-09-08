import { describe, expect, it } from 'vitest';
import {
  addressChangeSchema,
  campaignCreateSchema,
  customerCreateSchema,
  locationSamplesSchema,
  reminderSchema,
} from '../../src/common/contracts.js';

describe('API contracts', () => {
  it('accepts a master customer address with E.164 phone and coordinates', () => {
    const result = customerCreateSchema.safeParse({
      externalId: 'CUST-001',
      name: 'Customer One',
      phoneE164: '+6281234567890',
      address: {
        province: 'DKI Jakarta',
        city: 'Jakarta Selatan',
        district: 'Kebayoran Baru',
        subdistrict: 'Senayan',
        postalCode: '12190',
        street: 'Jl. Example',
        houseNumber: '10',
        referenceLocation: { latitude: -6.22, longitude: 106.81 },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('ACTIVE');
      expect(result.data.address.referencePrecision).toBe('EXACT_MASTER');
    }
  });

  it('rejects invalid customer phone and GPS sample counts', () => {
    const customer = customerCreateSchema.safeParse({
      externalId: 'CUST-001',
      name: 'Customer One',
      phoneE164: '081234567890',
      address: {
        province: 'DKI Jakarta',
        city: 'Jakarta Selatan',
        district: 'Kebayoran Baru',
        subdistrict: 'Senayan',
        postalCode: '12190',
        street: 'Jl. Example',
        houseNumber: '10',
        referenceLocation: { latitude: -6.22, longitude: 106.81 },
      },
    });
    const samples = locationSamplesSchema.safeParse({ samples: [] });

    expect(customer.success).toBe(false);
    expect(samples.success).toBe(false);
  });

  it('accepts a master address without coordinates and marks its reference as unknown', () => {
    const result = customerCreateSchema.safeParse({
      externalId: 'CUST-002',
      name: 'Customer Two',
      phoneE164: '+6281234567890',
      address: {
        province: 'DKI Jakarta',
        city: 'Jakarta Barat',
        district: 'Palmerah',
        subdistrict: 'Palmerah',
        postalCode: '11540',
        street: 'Jl. KH Syahdan',
        houseNumber: '10A',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address.referenceLocation).toBeUndefined();
      expect(result.data.address.referenceSource).toBe('CUSTOMER_PROPOSED');
      expect(result.data.address.referencePrecision).toBe('UNKNOWN');
      expect(result.data.address.referenceConfidence).toBe(0);
    }
  });

  it('requires a five-digit postal code and a real house number', () => {
    const baseAddress = {
      province: 'DKI Jakarta',
      city: 'Jakarta Barat',
      district: 'Palmerah',
      subdistrict: 'Palmerah',
      postalCode: '11540',
      street: 'Jl. KH Syahdan',
      houseNumber: '10',
    };

    expect(addressChangeSchema.safeParse({ ...baseAddress, houseNumber: '' }).success).toBe(false);
    expect(addressChangeSchema.safeParse({ ...baseAddress, houseNumber: 'TANPA NOMOR' }).success).toBe(false);
    expect(addressChangeSchema.safeParse({ ...baseAddress, postalCode: '1154' }).success).toBe(false);
    expect(
      addressChangeSchema.safeParse({ ...baseAddress, addressDetail: 'Blok A', landmark: 'Dekat pos satpam' }).success,
    ).toBe(true);
  });

  it('accepts a filter campaign without sending customer IDs to the API', () => {
    const result = campaignCreateSchema.safeParse({
      name: 'All unverified',
      targetFilter: { locationStatus: 'UNVERIFIED' },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetFilter?.locationStatus).toBe('UNVERIFIED');
  });

  it('requires exactly one campaign target source', () => {
    expect(campaignCreateSchema.safeParse({ name: 'Invalid' }).success).toBe(false);
    expect(
      campaignCreateSchema.safeParse({
        name: 'Invalid',
        customerIds: [],
        targetFilter: { locationStatus: 'UNVERIFIED' },
      }).success,
    ).toBe(false);
  });

  it('accepts one reminder time and lets the server schedule the remaining reminders', () => {
    const valid = reminderSchema.safeParse({
      scheduledAt: '2026-09-02T05:00:00.000Z',
      reminderUntilAt: '2026-09-04T05:00:00.000Z',
    });
    expect(valid.success).toBe(true);
    expect(reminderSchema.safeParse({ scheduledAt: '2026-09-02T05:00:00.000Z' }).success).toBe(true);
  });
});
