import { AddressChangeInput } from '../../common/contracts.js';
import { ReverseGeocodeEvidence } from '../../modules/validation/engine.js';

export interface GeocodingResult extends ReverseGeocodeEvidence {
  latitude: number;
  longitude: number;
  precision: 'ROOFTOP' | 'HOUSE' | 'STREET' | 'AREA' | 'DISTRICT' | 'CITY';
  confidence: number;
  provider: string;
  providerPlaceId?: string;
}

export abstract class GeocodingPort {
  abstract reverse(latitude: number, longitude: number): Promise<GeocodingResult>;
  abstract forward(address: AddressChangeInput): Promise<GeocodingResult>;
}
