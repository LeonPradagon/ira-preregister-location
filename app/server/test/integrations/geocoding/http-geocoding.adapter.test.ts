import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpGeocodingAdapter } from '../../../src/integrations/geocoding/http-geocoding.adapter.js';
import { providerHttpClient } from '../../../src/common/http/provider-http.client.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEOCODING_BASE_URL;
});

describe('HTTP geocoding adapter', () => {
  it('maps the normalized reverse geocode provider contract', async () => {
    process.env.GEOCODING_BASE_URL = 'https://geocoder.test';
    const getMock = vi.spyOn(providerHttpClient, 'get').mockResolvedValue({
      data: { latitude: -6.884, longitude: 107.613, precision: 'HOUSE', confidence: 0.98, provider: 'test', province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago', street: 'Jalan Ir H Juanda', houseNumber: '10', formattedAddress: 'Jalan Ir H Juanda No. 10' },
    } as never);
    const result = await new HttpGeocodingAdapter().reverse(-6.884, 107.613);
    expect(result.precision).toBe('HOUSE');
    expect(getMock).toHaveBeenCalledOnce();
  });
});
