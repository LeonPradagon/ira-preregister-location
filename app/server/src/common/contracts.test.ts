import { describe, expect, it } from 'vitest';
import { customerCreateSchema, locationSamplesSchema } from './contracts.js';

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
});
