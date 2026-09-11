import { describe, expect, it } from 'vitest';
import {
  addressChangeSchema,
  campaignCreateSchema,
  customerCreateSchema,
  customerListQuerySchema,
  locationSamplesSchema,
  reminderSchema,
  validationConfigSchema,
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

  it('allows a missing postal code but requires a real house number', () => {
    const baseAddress = {
      province: 'DKI Jakarta',
      city: 'Jakarta Barat',
      district: 'Palmerah',
      subdistrict: 'Palmerah',
      postalCode: '11540',
      street: 'Jl. KH Syahdan',
      houseNumber: '10',
    };

    expect(addressChangeSchema.safeParse({ ...baseAddress, houseNumber: '' }).success).toBe(true);
    expect(addressChangeSchema.safeParse({ ...baseAddress, houseNumber: undefined }).success).toBe(true);
    expect(addressChangeSchema.safeParse({ ...baseAddress, houseNumber: 'TANPA NOMOR' }).success).toBe(false);
    expect(addressChangeSchema.safeParse({ ...baseAddress, postalCode: '1154' }).success).toBe(false);
    expect(addressChangeSchema.safeParse({ ...baseAddress, postalCode: '' }).success).toBe(true);
    expect(addressChangeSchema.safeParse({ ...baseAddress, postalCode: undefined }).success).toBe(true);
    expect(
      addressChangeSchema.safeParse({ ...baseAddress, addressDetail: 'Blok A', landmark: 'Dekat pos satpam' }).success,
    ).toBe(true);
  });

  it('rejects markup and control characters in customer address input', () => {
    const baseAddress = {
      province: 'DKI Jakarta',
      city: 'Jakarta Barat',
      district: 'Palmerah',
      subdistrict: 'Palmerah',
      postalCode: '11540',
      street: 'Jl. KH Syahdan',
      houseNumber: '10',
    };

    expect(addressChangeSchema.safeParse({ ...baseAddress, street: '<script>alert(1)</script>' }).success).toBe(false);
    expect(addressChangeSchema.safeParse({ ...baseAddress, addressDetail: 'Blok A\u0000' }).success).toBe(false);
    expect(addressChangeSchema.safeParse({ ...baseAddress, street: "Jl. O'Connor #12/A" }).success).toBe(true);
  });

  it('accepts a filter campaign without sending customer IDs to the API', () => {
    const result = campaignCreateSchema.safeParse({
      name: 'All unverified',
      targetFilter: { locationStatus: 'UNVERIFIED' },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.targetFilter?.locationStatus).toBe('UNVERIFIED');
  });

  it('accepts registered address completeness filters', () => {
    expect(customerListQuerySchema.safeParse({ addressCompleteness: 'INCOMPLETE' }).success).toBe(true);
    expect(customerListQuerySchema.safeParse({ addressCompleteness: 'COMPLETE' }).success).toBe(true);
    expect(customerListQuerySchema.safeParse({ addressCompleteness: 'UNKNOWN' }).success).toBe(false);
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

  it('allows campaign daily limits up to 10,000', () => {
    expect(
      campaignCreateSchema.safeParse({
        name: 'Large campaign',
        customerIds: ['11111111-1111-4111-8111-111111111111'],
        dailySendLimit: 10000,
      }).success,
    ).toBe(true);
    expect(
      campaignCreateSchema.safeParse({
        name: 'Too large campaign',
        customerIds: ['11111111-1111-4111-8111-111111111111'],
        dailySendLimit: 10001,
      }).success,
    ).toBe(false);
  });

  it('accepts configurable WhatsApp rate and cooldown rules', () => {
    const result = validationConfigSchema.safeParse({
      WHATSAPP_DAILY_SEND_LIMIT: 2500,
      WHATSAPP_RATE_LIMIT_PER_SECOND: 5,
      WHATSAPP_MIN_INTERVAL_MINUTES: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.WHATSAPP_RATE_LIMIT_PER_SECOND).toBe(5);
      expect(result.data.WHATSAPP_MIN_INTERVAL_MINUTES).toBe(10);
    }
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
