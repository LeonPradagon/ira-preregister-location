import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { providerErrorMessage, providerHttpClient } from '../../common/http/provider-http.client.js';
import { AddressLookupInput } from '../../common/contracts.js';
import { displayProvinceName } from '../../common/region-names.js';
import { GeocodingPort, GeocodingResult } from './geocoding.port.js';

type NominatimResult = {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  address?: Record<string, string | undefined>;
};

const first = (...values: Array<string | undefined>): string => values.find((value) => Boolean(value?.trim()))?.trim() ?? '';

const jakartaMunicipalityPattern = /^(?:kota administrasi\s+)?jakarta\s+(barat|pusat|selatan|timur|utara|kepulauan seribu)$/i;
const isJakartaMunicipality = (value?: string): boolean => Boolean(value?.trim() && jakartaMunicipalityPattern.test(value.trim()));

function precisionFor(result: NominatimResult): GeocodingResult['precision'] {
  const type = first(result.addresstype, result.type).toLowerCase();
  if (result.address?.house_number || ['house', 'house_number', 'building', 'entrance'].includes(type)) return 'HOUSE';
  if (['road', 'street', 'pedestrian', 'path'].includes(type)) return 'STREET';
  if (['suburb', 'neighbourhood', 'village', 'hamlet'].includes(type)) return 'AREA';
  if (['city_district', 'district', 'borough'].includes(type)) return 'DISTRICT';
  return 'CITY';
}

function mapResult(result: NominatimResult): GeocodingResult {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !result.display_name) throw new ServiceUnavailableException('OSM Nominatim returned an invalid result');
  const address = result.address ?? {};
  const precision = precisionFor(result);
  const importance = Number(result.importance);
  const confidence = Number.isFinite(importance) ? Math.min(0.9, Math.max(0.5, 0.5 + importance * 0.4)) : 0.6;
  const city = first(address.city, address.municipality, address.town, address.county);
  const jakartaAdministrativeCity = /^(dki jakarta|daerah khusus ibukota jakarta)$/i.test(city);
  // In Jakarta Nominatim commonly returns the province in `city` and the
  // actual city/administrative municipality in `state_district`, `district`,
  // or `city_district`, depending on the mapped area.
  const jakartaMunicipality = [address.state_district, address.district, address.city_district]
    .find((value) => isJakartaMunicipality(value));
  const province = first(address.state, address.province, jakartaAdministrativeCity ? city : undefined);
  const resolvedCity = first(jakartaAdministrativeCity ? jakartaMunicipality : undefined, city, address.state_district);
  const district = first(
    address.district && !isJakartaMunicipality(address.district) ? address.district : undefined,
    address.city_district && !isJakartaMunicipality(address.city_district) ? address.city_district : undefined,
    address.borough && !isJakartaMunicipality(address.borough) ? address.borough : undefined,
    address.suburb,
    address.district,
    address.city_district,
  );
  return {
    latitude,
    longitude,
    precision,
    confidence: Math.round(confidence * 1000) / 1000,
    provider: 'OpenStreetMap Nominatim',
    providerPlaceId: result.place_id == null ? undefined : String(result.place_id),
    province: displayProvinceName(province),
    city: resolvedCity,
    district,
    subdistrict: first(address.village, address.neighbourhood, address.hamlet, address.suburb),
    street: first(address.road, address.pedestrian, address.path),
    houseNumber: address.house_number,
    postalCode: address.postcode,
    formattedAddress: result.display_name,
  };
}

@Injectable()
export class OsmGeocodingAdapter extends GeocodingPort {
  private readonly baseUrl = (process.env.OSM_NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  private readonly userAgent = process.env.OSM_NOMINATIM_USER_AGENT || 'IRAPreregist/1.0';
  private readonly cacheTtlMs = Number(process.env.OSM_NOMINATIM_CACHE_TTL_MS ?? 300_000);
  private readonly cache = new Map<string, { expiresAt: number; value: GeocodingResult }>();
  private requestQueue = Promise.resolve();
  private nextRequestAt = 0;

  private async request(path: string, params: Record<string, string>): Promise<GeocodingResult> {
    const cacheKey = `${path}?${new URLSearchParams(params).toString()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const task = this.requestQueue.then(async () => {
      const waitMs = Math.max(0, this.nextRequestAt - Date.now());
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.nextRequestAt = Date.now() + 1000;
      try {
        const response = await providerHttpClient.get<unknown>(`${this.baseUrl}${path}`, {
          params,
          timeout: Number(process.env.GEOCODING_TIMEOUT_MS ?? 5000),
          headers: {
            'User-Agent': this.userAgent,
            ...(process.env.WEB_ORIGIN ? { Referer: process.env.WEB_ORIGIN } : {}),
          },
        });
        if (!response.data || (Array.isArray(response.data) && response.data.length === 0)) throw new Error('OSM Nominatim returned no result');
        return response.data as NominatimResult | NominatimResult[];
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        if (axios.isAxiosError(error) && error.response?.status === 429) throw new ServiceUnavailableException('OSM Nominatim rate limit reached');
        throw new ServiceUnavailableException(`OSM Nominatim unavailable: ${providerErrorMessage(error)}`);
      }
    });
    this.requestQueue = task.then(() => undefined, () => undefined);
    const result = await task;
    const mapped = Array.isArray(result) ? result[0] : result;
    const value = mapResult(mapped);
    this.cache.set(cacheKey, { expiresAt: Date.now() + this.cacheTtlMs, value });
    return value;
  }

  async reverse(latitude: number, longitude: number): Promise<GeocodingResult> {
    return this.request('/reverse', {
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18',
      lat: String(latitude),
      lon: String(longitude),
      'accept-language': 'id',
    });
  }

  async forward(address: AddressLookupInput): Promise<GeocodingResult> {
    const query = [
      address.street,
      address.houseNumber && `No. ${address.houseNumber}`,
      address.subdistrict,
      address.district,
      address.city,
      address.province,
      address.postalCode,
      'Indonesia',
    ].filter(Boolean).join(', ');
    return this.request('/search', {
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
      countrycodes: 'id',
      'accept-language': 'id',
    });
  }
}
