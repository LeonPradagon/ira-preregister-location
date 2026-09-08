import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { z } from 'zod';
import { providerErrorMessage, providerHttpClient } from '../../common/http/provider-http.client.js';
import { AddressLookupInput } from '../../common/contracts.js';
import { GeocodingPort, GeocodingResult } from './geocoding.port.js';

const resultSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  precision: z.enum(['ROOFTOP', 'HOUSE', 'STREET', 'AREA', 'DISTRICT', 'CITY']),
  confidence: z.number().finite().min(0).max(1),
  provider: z.string().min(1),
  providerPlaceId: z.string().optional(),
  province: z.string(),
  city: z.string(),
  district: z.string(),
  subdistrict: z.string(),
  street: z.string(),
  houseNumber: z.string().optional(),
  postalCode: z.string().optional(),
  formattedAddress: z.string(),
});

@Injectable()
export class HttpGeocodingAdapter extends GeocodingPort {
  private readonly baseUrl = (process.env.GEOCODING_BASE_URL ?? '').replace(/\/$/, '');
  private readonly timeoutMs = Number(process.env.GEOCODING_TIMEOUT_MS ?? 5000);
  private readonly maxRetries = Number(process.env.GEOCODING_MAX_RETRIES ?? 2);

  private async request(path: string, query: Record<string, string>): Promise<GeocodingResult> {
    if (!this.baseUrl) throw new ServiceUnavailableException('Geocoding provider is not configured');
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await providerHttpClient.get<unknown>(`${this.baseUrl}${path}`, {
          params: query,
          timeout: this.timeoutMs,
          headers: process.env.GEOCODING_API_KEY
            ? { authorization: `Bearer ${process.env.GEOCODING_API_KEY}` }
            : undefined,
        });
        return resultSchema.parse(response.data);
      } catch (error) {
        lastError = error;
        if (axios.isAxiosError(error) && error.response && error.response.status < 500) break;
        if (attempt === this.maxRetries) break;
      }
    }
    throw new ServiceUnavailableException(`Geocoding provider unavailable: ${providerErrorMessage(lastError)}`);
  }

  reverse(latitude: number, longitude: number): Promise<GeocodingResult> {
    return this.request('/reverse', { latitude: String(latitude), longitude: String(longitude) });
  }

  forward(address: AddressLookupInput): Promise<GeocodingResult> {
    return this.request(
      '/forward',
      Object.fromEntries(
        Object.entries(address).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ),
    );
  }
}
