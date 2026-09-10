import { OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { AddressLookupInput } from '../../common/contracts.js';
import { GeocodingPort, GeocodingResult } from './geocoding.port.js';

export class FallbackGeocodingAdapter extends GeocodingPort implements OnModuleDestroy {
  constructor(
    private readonly primary: GeocodingPort,
    private readonly fallback: GeocodingPort,
  ) {
    super();
  }

  async reverse(latitude: number, longitude: number): Promise<GeocodingResult> {
    try {
      return await this.primary.reverse(latitude, longitude);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      return this.fallback.reverse(latitude, longitude);
    }
  }

  async forward(address: AddressLookupInput): Promise<GeocodingResult> {
    try {
      return await this.primary.forward(address);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      return this.fallback.forward(address);
    }
  }

  async onModuleDestroy() {
    for (const adapter of [this.primary, this.fallback]) {
      if ('onModuleDestroy' in adapter)
        await (adapter as { onModuleDestroy?: () => Promise<void> }).onModuleDestroy?.();
    }
  }
}
