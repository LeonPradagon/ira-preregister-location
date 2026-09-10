import { describe, expect, it } from 'vitest';
import { auditCoordinateAddress } from '../../../src/modules/validation/coordinate-audit.js';

const address = {
  province: 'Jawa Barat',
  city: 'Subang',
  district: 'Pusakanagara',
  subdistrict: 'Patimban',
  street: 'Dusun Terangtum',
};

describe('coordinate audit', () => {
  it('matches a coordinate whose reverse-geocoded region and street agree', () => {
    const result = auditCoordinateAddress(address, {
      province: 'Jawa Barat',
      city: 'Kabupaten Subang',
      district: 'Pusakanagara',
      subdistrict: 'Patimban',
      street: 'Dusun Terangtum',
      formattedAddress: 'Dusun Terangtum, Patimban, Pusakanagara, Subang, Jawa Barat',
    });

    expect(result.status).toBe('MATCHED');
    expect(result.evidence.matches).toEqual({ province: true, city: true, district: true, subdistrict: true });
  });

  it('marks a different district as a mismatch', () => {
    const result = auditCoordinateAddress(address, {
      province: 'Jawa Barat',
      city: 'Subang',
      district: 'Pamanukan',
      subdistrict: 'Patimban',
      street: 'Jalan Raya Pantura',
      formattedAddress: 'Pamanukan, Subang, Jawa Barat',
    });

    expect(result.status).toBe('MISMATCH');
  });

  it('keeps rural points uncertain when the map has no street name', () => {
    const result = auditCoordinateAddress(address, {
      province: 'Jawa Barat',
      city: 'Subang',
      district: 'Pusakanagara',
      subdistrict: 'Patimban',
      street: '',
      formattedAddress: 'Patimban, Pusakanagara, Subang, Jawa Barat',
    });

    expect(result.status).toBe('UNCERTAIN');
  });
});
