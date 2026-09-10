import { ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { AddressLookupInput } from '../../common/contracts.js';
import { providerErrorMessage, providerHttpClient } from '../../common/http/provider-http.client.js';
import { displayProvinceName } from '../../common/region-names.js';
import { GeocodingPort, GeocodingResult } from './geocoding.port.js';

type GoogleAddressComponent = {
  long_name?: string;
  types?: string[];
};

type GoogleGeocodingResult = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
  place_id?: string;
  types?: string[];
};

type GoogleGeocodingResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodingResult[];
};

const first = (...values: Array<string | undefined>): string =>
  values.find((value) => Boolean(value?.trim()))?.trim() ?? '';

const component = (components: GoogleAddressComponent[], ...types: string[]): string => {
  for (const type of types) {
    const value = components.find((item) => item.types?.includes(type))?.long_name;
    if (value?.trim()) return value.trim();
  }
  return '';
};

function precisionFor(result: GoogleGeocodingResult, houseNumber: string): GeocodingResult['precision'] {
  const locationType = result.geometry?.location_type?.toUpperCase();
  const resultTypes = result.types ?? [];

  if (locationType === 'ROOFTOP') return houseNumber ? 'HOUSE' : 'ROOFTOP';
  if (locationType === 'RANGE_INTERPOLATED') return houseNumber ? 'HOUSE' : 'STREET';
  if (resultTypes.includes('street_address') || resultTypes.includes('route')) return 'STREET';
  if (
    resultTypes.some((type) =>
      ['neighborhood', 'sublocality', 'sublocality_level_1', 'village', 'hamlet'].includes(type),
    )
  )
    return 'AREA';
  if (resultTypes.includes('administrative_area_level_3')) return 'DISTRICT';
  return 'CITY';
}

function confidenceFor(locationType?: string): number {
  switch (locationType?.toUpperCase()) {
    case 'ROOFTOP':
      return 0.98;
    case 'RANGE_INTERPOLATED':
      return 0.9;
    case 'GEOMETRIC_CENTER':
      return 0.75;
    case 'APPROXIMATE':
      return 0.6;
    default:
      return 0.65;
  }
}

function mapResult(result: GoogleGeocodingResult): GeocodingResult {
  const latitude = Number(result.geometry?.location?.lat);
  const longitude = Number(result.geometry?.location?.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !result.formatted_address)
    throw new ServiceUnavailableException('Google Geocoding returned an invalid result');

  const components = result.address_components ?? [];
  const houseNumber = component(components, 'street_number');
  const province = component(components, 'administrative_area_level_1');
  const city = component(components, 'administrative_area_level_2', 'locality');
  const district = component(components, 'administrative_area_level_3', 'sublocality_level_1', 'sublocality');
  const subdistrict = component(
    components,
    'administrative_area_level_4',
    'sublocality_level_1',
    'sublocality',
    'village',
    'neighborhood',
  ) || district;

  return {
    latitude,
    longitude,
    precision: precisionFor(result, houseNumber),
    confidence: confidenceFor(result.geometry?.location_type),
    provider: 'Google Geocoding API',
    providerPlaceId: result.place_id,
    province: displayProvinceName(province),
    city,
    district,
    subdistrict,
    street: component(components, 'route'),
    houseNumber: houseNumber || undefined,
    postalCode: component(components, 'postal_code') || undefined,
    formattedAddress: result.formatted_address,
  };
}

export class GoogleGeocodingAdapter extends GeocodingPort {
  private readonly apiKey = process.env.GOOGLE_GEOCODING_API_KEY?.trim() ?? '';
  private readonly baseUrl = (
    process.env.GOOGLE_GEOCODING_BASE_URL || 'https://maps.googleapis.com/maps/api/geocode/json'
  ).replace(/\/$/, '');

  private async request(params: Record<string, string>): Promise<GeocodingResult> {
    if (!this.apiKey) throw new ServiceUnavailableException('Google Geocoding API key is not configured');

    let response: { data: GoogleGeocodingResponse };
    try {
      response = await providerHttpClient.get<GoogleGeocodingResponse>(this.baseUrl, {
        params: {
          ...params,
          key: this.apiKey,
          language: 'id',
          region: 'id',
        },
        timeout: Number(process.env.GEOCODING_TIMEOUT_MS ?? 5000),
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      throw new ServiceUnavailableException(
        `Google Geocoding unavailable${status ? ` (${status})` : ''}: ${providerErrorMessage(error)}`,
      );
    }

    const data = response.data;
    if (data?.status !== 'OK' || !data.results?.length) {
      const reason = first(data?.error_message, data?.status, 'no result');
      throw new ServiceUnavailableException(`Google Geocoding returned ${reason}`);
    }
    return mapResult(data.results[0]);
  }

  async reverse(latitude: number, longitude: number): Promise<GeocodingResult> {
    return this.request({ latlng: `${latitude},${longitude}` });
  }

  async forward(address: AddressLookupInput): Promise<GeocodingResult> {
    const query = [
      address.street,
      address.houseNumber && `No. ${address.houseNumber}`,
      address.unit,
      address.building,
      address.block,
      address.rt && `RT ${address.rt}`,
      address.rw && `RW ${address.rw}`,
      address.subdistrict,
      address.district,
      address.city,
      address.province,
      address.postalCode,
      'Indonesia',
    ]
      .filter(Boolean)
      .join(', ');
    return this.request({ address: query });
  }
}
