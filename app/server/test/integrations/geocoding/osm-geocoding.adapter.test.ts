import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerHttpClient } from '../../../src/common/http/provider-http.client.js';
import { OsmGeocodingAdapter } from '../../../src/integrations/geocoding/osm-geocoding.adapter.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OSM_NOMINATIM_BASE_URL;
  delete process.env.OSM_NOMINATIM_USER_AGENT;
});

describe('OSM Nominatim geocoding adapter', () => {
  it('maps reverse geocoding address details and sends an identifying user agent', async () => {
    process.env.OSM_NOMINATIM_BASE_URL = 'https://nominatim.test';
    process.env.OSM_NOMINATIM_USER_AGENT = 'ExactLocationTest/1.0 (test@example.com)';
    const getMock = vi.spyOn(providerHttpClient, 'get').mockResolvedValue({
      data: {
        place_id: 123,
        lat: '-6.2088',
        lon: '106.8456',
        display_name: 'Jalan Test No. 10, Jakarta, Indonesia',
        addresstype: 'house',
        importance: 0.7,
        address: {
          state: 'DKI Jakarta', city: 'Jakarta Pusat', city_district: 'Menteng', suburb: 'Gondangdia',
          road: 'Jalan Test', house_number: '10', postcode: '10350',
        },
      },
    } as never);

    const result = await new OsmGeocodingAdapter().reverse(-6.2088, 106.8456);

    expect(result).toMatchObject({ provider: 'OpenStreetMap Nominatim', precision: 'HOUSE', province: 'DKI Jakarta', city: 'Jakarta Pusat', district: 'Menteng', subdistrict: 'Gondangdia', street: 'Jalan Test', houseNumber: '10', postalCode: '10350' });
    expect(getMock).toHaveBeenCalledWith('https://nominatim.test/reverse', expect.objectContaining({ params: expect.objectContaining({ format: 'jsonv2', addressdetails: '1' }), headers: expect.objectContaining({ 'User-Agent': 'ExactLocationTest/1.0 (test@example.com)' }) }));
  });

  it('maps Jakarta province and municipality when Nominatim puts them in adjacent levels', async () => {
    process.env.OSM_NOMINATIM_BASE_URL = 'https://nominatim.test';
    vi.spyOn(providerHttpClient, 'get').mockResolvedValue({
      data: {
        place_id: 456,
        lat: '-6.2008',
        lon: '106.7840',
        display_name: 'Jalan KH Syahdan, Palmerah, Jakarta Barat, Indonesia',
        addresstype: 'road',
        address: {
          city: 'Daerah Khusus Ibukota Jakarta', state_district: 'Jakarta Barat',
          district: 'Jakarta Barat', suburb: 'Palmerah', road: 'Jalan KH Syahdan',
        },
      },
    } as never);

    const result = await new OsmGeocodingAdapter().reverse(-6.2008, 106.7840);

    expect(result).toMatchObject({ province: 'Daerah Khusus Ibukota Jakarta', city: 'Jakarta Barat', district: 'Jakarta Barat', subdistrict: 'Palmerah' });
  });
});
