import { describe, expect, it } from 'vitest';
import { houseNumberFromAddress, streetFromAddress } from '../../scripts/address-parser.mjs';

describe('import address parser', () => {
  it('uses the apartment number from the address reference when the main address has no house number', () => {
    expect(
      houseNumberFromAddress(
        'City Park Apartment Jakarta Barat, Daerah Khusus Ibukota Jakarta 11730, Indonesia',
        'Apartement citypark tower ca lantai 1 no 21',
      ),
    ).toBe('21');
  });

  it('prefers the explicit house number in the main address', () => {
    expect(
      houseNumberFromAddress('Jalan Merdeka No. 10, Jakarta', 'Apartemen Merdeka Tower A No. 21'),
    ).toBe('10');
  });

  it('does not treat a generic landmark number as a house number', () => {
    expect(houseNumberFromAddress('Jalan Merdeka, Jakarta', 'Dekat masjid no 21')).toBe('UNKNOWN');
  });

  it('derives a block locality from a rural address', () => {
    expect(
      streetFromAddress(
        'Desa Pranggong Blok Pulo Gosong Rt.17, Rw.03, Kec. Arahan Kab. Indramayu, Jawa Barat',
      ),
    ).toBe('Blok Pulo Gosong');
  });

  it('derives a block and kavling locality from a rural address', () => {
    expect(
      streetFromAddress(
        'Desa Klampok RT.03 RW.03 Blok Bulan Kaving H Tawaf Kec.Wanasari Kab. Brebes Jawa Tengah',
      ),
    ).toBe('Blok Bulan Kaving H Tawaf');
  });

  it('derives a dusun locality from a rural address', () => {
    expect(
      streetFromAddress(
        'RT 08/RW 04 dusun terangtum, desa patimban, kecamatan pusakanagara, kabupaten subang',
      ),
    ).toBe('dusun terangtum');
  });

  it('does not treat an administrative-only address as a street', () => {
    expect(streetFromAddress('RT 03/RW 02, Desa X, Kecamatan Y, Kabupaten Z, Jawa Barat')).toBe(
      'UNKNOWN',
    );
  });
});
