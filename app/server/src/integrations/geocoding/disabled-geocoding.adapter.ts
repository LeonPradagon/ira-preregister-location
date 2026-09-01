import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AddressLookupInput } from '../../common/contracts.js';
import { GeocodingPort } from './geocoding.port.js';

@Injectable()
export class DisabledGeocodingAdapter extends GeocodingPort {
  reverse(): Promise<never> {
    return Promise.reject(new ServiceUnavailableException('Geocoding provider is not configured'));
  }

  forward(_address: AddressLookupInput): Promise<never> {
    return Promise.reject(new ServiceUnavailableException('Geocoding provider is not configured'));
  }
}
