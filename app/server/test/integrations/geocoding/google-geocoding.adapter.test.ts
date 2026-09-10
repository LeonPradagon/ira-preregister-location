import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerHttpClient } from '../../../src/common/http/provider-http.client.js';
import { GoogleGeocodingAdapter } from '../../../src/integrations/geocoding/google-geocoding.adapter.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_GEOCODING_API_KEY;
  delete process.env.GOOGLE_GEOCODING_BASE_URL;
});

const googleResult = {
  address_components: [
    { long_name: '10', types: ['street_number'] },
    { long_name: 'Jalan KH Syahdan', types: ['route'] },
    { long_name: 'Palmerah', types: ['administrative_area_level_4'] },
    { long_name: 'Palmerah', types: ['administrative_area_level_3'] },
    { long_name: 'Jakarta Barat', types: ['administrative_area_level_2'] },
    { long_name: 'Daerah Khusus Ibukota Jakarta', types: ['administrative_area_level_1'] },
    { long_name: '11480', types: ['postal_code'] },
  ],
  formatted_address: 'Jalan KH Syahdan No. 10, Palmerah, Jakarta Barat, Indonesia',
  geometry: {
    location: { lat: -6.2, lng: 106.784 },
    location_type: 'ROOFTOP',
  },
  place_id: 'google-place-1',
  types: ['street_address'],
};

describe('Google Geocoding adapter', () => {
  it('maps reverse geocoding and sends the API key as a query parameter', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    process.env.GOOGLE_GEOCODING_BASE_URL = 'https://maps.test/geocode/json';
    const getMock = vi.spyOn(providerHttpClient, 'get').mockResolvedValue({
      data: { status: 'OK', results: [googleResult] },
    } as never);

    const result = await new GoogleGeocodingAdapter().reverse(-6.2, 106.784);

    expect(result).toMatchObject({
      provider: 'Google Geocoding API',
      providerPlaceId: 'google-place-1',
      precision: 'HOUSE',
      province: 'DKI Jakarta',
      city: 'Jakarta Barat',
      district: 'Palmerah',
      subdistrict: 'Palmerah',
      street: 'Jalan KH Syahdan',
      houseNumber: '10',
      postalCode: '11480',
      latitude: -6.2,
      longitude: 106.784,
    });
    expect(getMock).toHaveBeenCalledWith(
      'https://maps.test/geocode/json',
      expect.objectContaining({
        params: expect.objectContaining({
          latlng: '-6.2,106.784',
          key: 'test-key',
          language: 'id',
          region: 'id',
        }),
      }),
    );
  });

  it('uses the full address for forward geocoding', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    const getMock = vi.spyOn(providerHttpClient, 'get').mockResolvedValue({
      data: { status: 'OK', results: [googleResult] },
    } as never);

    await new GoogleGeocodingAdapter().forward({
      province: 'DKI Jakarta',
      city: 'Jakarta Barat',
      district: 'Palmerah',
      subdistrict: 'Palmerah',
      street: 'Jalan KH Syahdan',
      houseNumber: '10',
      postalCode: '',
    });

    expect(getMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          address: expect.stringContaining('Jalan KH Syahdan, No. 10'),
          key: 'test-key',
        }),
      }),
    );
  });

  it('turns Google non-OK responses into a fallback-compatible error', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    vi.spyOn(providerHttpClient, 'get').mockResolvedValue({
      data: { status: 'REQUEST_DENIED', error_message: 'API key is not valid' },
    } as never);

    await expect(new GoogleGeocodingAdapter().reverse(-6.2, 106.784)).rejects.toThrow(
      'Google Geocoding returned API key is not valid',
    );
  });
});
