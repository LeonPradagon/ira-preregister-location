import { describe, expect, it, vi } from 'vitest';
import { HttpGeocodingAdapter } from './http-geocoding.adapter.js';

describe('HTTP geocoding adapter', () => {
  it('maps the normalized reverse geocode provider contract', async () => {
    process.env.GEOCODING_BASE_URL = 'https://geocoder.test';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ latitude: -6.884, longitude: 107.613, precision: 'HOUSE', confidence: 0.98, provider: 'test', province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago', street: 'Jalan Ir H Juanda', houseNumber: '10', formattedAddress: 'Jalan Ir H Juanda No. 10' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new HttpGeocodingAdapter().reverse(-6.884, 107.613);
    expect(result.precision).toBe('HOUSE');
    expect(fetchMock).toHaveBeenCalledOnce();
    delete process.env.GEOCODING_BASE_URL;
    vi.unstubAllGlobals();
  });
});
