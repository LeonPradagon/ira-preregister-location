import { GpsSample } from '../../common/contracts.js';

export type ReferencePrecision = 'EXACT_MASTER' | 'ROOFTOP' | 'HOUSE' | 'STREET' | 'AREA' | 'DISTRICT' | 'CITY';
export type ValidationResult = 'LOCATION_VALID' | 'LOW_GPS_ACCURACY' | 'LOCATION_MISMATCH' | 'MANUAL_REVIEW';

export interface AddressEvidence {
  id: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  street: string;
  houseNumber?: string;
  postalCode?: string;
  referenceLatitude: number | null;
  referenceLongitude: number | null;
  referencePrecision: ReferencePrecision;
}

export interface ReverseGeocodeEvidence {
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  street: string;
  houseNumber?: string;
  postalCode?: string;
  formattedAddress: string;
}

export interface ValidationConfig {
  gpsMaxAccuracyMeters: number;
  homeRadiusMeters: number;
  streetMatchThreshold: number;
  addressScoreThreshold: number;
}

export interface ValidationDecision {
  result: ValidationResult;
  bestSample: GpsSample;
  sampleSpreadMeters: number;
  distanceFromReferenceMeters: number | null;
  addressScore: number;
  provinceMatch: boolean;
  cityMatch: boolean;
  districtMatch: boolean;
  subdistrictMatch: boolean;
  streetScore: number;
  houseNumberMatch?: boolean;
  reasonCodes: string[];
  referencePrecision: ReferencePrecision;
  reverseGeocode: ReverseGeocodeEvidence;
}

export const normalizeAddress = (value: string): string =>
  value
    .toLocaleLowerCase('id-ID')
    .replace(/\b(jl|jln)\.?\b/g, 'jalan')
    .replace(/\b(kec)\.?\b/g, 'kecamatan')
    .replace(/\b(kel)\.?\b/g, 'kelurahan')
    .replace(/\b(no|nomor)\.?\b/g, 'no')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Administrative names are not consistent between the master data and
 * reverse-geocoders. For example, Jakarta may be returned as "DKI Jakarta",
 * "Daerah Khusus Ibukota Jakarta", or "Kota Administrasi Jakarta Barat".
 */
const normalizeAdministrativeArea = (value: string): string => normalizeAddress(value)
  .replace(/\bdaerah khusus ibukota jakarta\b/g, 'jakarta')
  .replace(/\bdki jakarta\b/g, 'jakarta')
  .replace(/\b(kota administrasi|kabupaten administrasi|kota|kabupaten)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const administrativeTokenScore = (left: string, right: string): number => {
  const a = normalizeAdministrativeArea(left);
  const b = normalizeAdministrativeArea(right);
  if (!a || !b) return 0;
  if (a === b || a.replace(/\s/g, '') === b.replace(/\s/g, '')) return 1;
  return tokenScore(a, b);
};

const administrativeMatch = (expected: string, candidates: string[], threshold = 0.7): boolean =>
  candidates.some((candidate) => Boolean(candidate?.trim()) && administrativeTokenScore(expected, candidate) >= threshold);

const isPlaceholderAddressValue = (value?: string): boolean => {
  const normalized = normalizeAddress(value ?? '');
  return !normalized || ['unknown', 'tidak diketahui', 'tanpa nomor', 'no number', 'n a', 'na', '-', '00000'].includes(normalized);
};

const plusCodePattern = /[23456789cfghjmpqrvwx]{4,8}\+(?:[23456789cfghjmpqrvwx]{3}\d|[23456789cfghjmpqrvwx]{4})(?=$|[\s,])|[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,3}/i;
const isOnlyPlusCode = (value?: string): boolean => Boolean(value?.trim() && new RegExp(`^(?:${plusCodePattern.source})$`, 'i').test(value.trim()));

const tokenScore = (left: string, right: string): number => {
  const a = new Set(normalizeAddress(left).split(' ').filter(Boolean));
  const b = new Set(normalizeAddress(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  if (left && right && normalizeAddress(left) === normalizeAddress(right)) return 1;
  const common = [...a].filter((token) => b.has(token) || [...b].some((candidate) => candidate.includes(token) || token.includes(candidate))).length;
  return Math.min(1, Math.round((common / Math.max(a.size, b.size)) * 100) / 100);
};

const distanceMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const earthRadius = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const haversine = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) * 10) / 10;
};

const sampleSpreadMeters = (samples: GpsSample[]): number => {
  let maximum = 0;
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      maximum = Math.max(maximum, distanceMeters(samples[left], samples[right]));
    }
  }
  return Math.round(maximum * 10) / 10;
};

export function decideValidation(
  samples: GpsSample[],
  address: AddressEvidence,
  reverseGeocode: ReverseGeocodeEvidence,
  config: ValidationConfig
): ValidationDecision {
  if (samples.length < 3 || samples.length > 5) throw new Error('GPS capture must contain 3 to 5 samples');
  const bestSample = [...samples].sort((a, b) => a.accuracyMeters - b.accuracyMeters)[0];
  const reasonCodes: string[] = [];
  const spreadMeters = sampleSpreadMeters(samples);
  const hasReferenceLocation = address.referenceLatitude != null && address.referenceLongitude != null;
  const precisionOk = hasReferenceLocation && ['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(address.referencePrecision);
  // OSM and Indonesian administrative data can shift Jakarta one level up or
  // down (for example city=DKI Jakarta, district=Jakarta Barat,
  // subdistrict=Palmerah). Compare adjacent levels as well as the canonical
  // level so a correct coordinate is not rejected because of provider schema.
  const provinceMatch = administrativeMatch(address.province, [reverseGeocode.province, reverseGeocode.city]);
  const cityMatch = administrativeMatch(address.city, [reverseGeocode.city, reverseGeocode.district]);
  const districtMatch = administrativeMatch(address.district, [reverseGeocode.district, reverseGeocode.subdistrict]);
  const subdistrictMatch = administrativeMatch(address.subdistrict, [reverseGeocode.subdistrict, reverseGeocode.district]);
  const streetScore = tokenScore(address.street, reverseGeocode.street);
  const houseNumberMatch = address.houseNumber && reverseGeocode.houseNumber
    ? normalizeAddress(address.houseNumber) === normalizeAddress(reverseGeocode.houseNumber)
    : undefined;
  const addressIncomplete = [address.province, address.city, address.district, address.subdistrict, address.street, address.houseNumber, address.postalCode]
    .some((value) => isPlaceholderAddressValue(value)) || isOnlyPlusCode(address.street);
  const addressNeedsManualReview = addressIncomplete || !hasReferenceLocation || !precisionOk;
  const addressScore = Math.round((Number(districtMatch) * 0.2 + Number(subdistrictMatch) * 0.25 + streetScore * 0.35 + (houseNumberMatch === undefined ? 0.2 : Number(houseNumberMatch) * 0.2)) * 100) / 100;
  const distanceFromReferenceMeters = hasReferenceLocation ? distanceMeters(bestSample, {
    latitude: address.referenceLatitude!,
    longitude: address.referenceLongitude!,
  }) : null;
  if (bestSample.accuracyMeters > config.gpsMaxAccuracyMeters) reasonCodes.push('LOW_GPS_ACCURACY');
  if (spreadMeters > 100) reasonCodes.push('GPS_SAMPLE_INCONSISTENT');
  if (!hasReferenceLocation) reasonCodes.push('REFERENCE_LOCATION_MISSING');
  if (!precisionOk) reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE');
  if (!provinceMatch) reasonCodes.push('PROVINCE_MISMATCH');
  if (!cityMatch) reasonCodes.push('CITY_MISMATCH');
  if (!districtMatch) reasonCodes.push('DISTRICT_MISMATCH');
  if (!subdistrictMatch) reasonCodes.push('SUBDISTRICT_MISMATCH');
  if (streetScore < config.streetMatchThreshold) reasonCodes.push('STREET_MISMATCH');
  if (houseNumberMatch === false) reasonCodes.push('HOUSE_NUMBER_MISMATCH');
  if (addressIncomplete) reasonCodes.push('ADDRESS_INCOMPLETE');
  if (distanceFromReferenceMeters != null && distanceFromReferenceMeters > config.homeRadiusMeters) reasonCodes.push('HOME_RADIUS_EXCEEDED');

  let result: ValidationResult = 'MANUAL_REVIEW';
  // An incomplete/unreferenced address cannot be proven automatically, even
  // when the device also reports a weak accuracy estimate. Keep the GPS
  // signal in reasonCodes, but make the actionable outcome manual review so
  // Ops fixes the address/reference instead of rejecting the customer as
  // being in the wrong place.
  if (addressNeedsManualReview) result = 'MANUAL_REVIEW';
  else if (bestSample.accuracyMeters > config.gpsMaxAccuracyMeters) result = 'LOW_GPS_ACCURACY';
  else if (spreadMeters > 100) result = 'MANUAL_REVIEW';
  else if (precisionOk && provinceMatch && cityMatch && districtMatch && subdistrictMatch && streetScore >= config.streetMatchThreshold && distanceFromReferenceMeters != null && distanceFromReferenceMeters <= config.homeRadiusMeters && addressScore >= config.addressScoreThreshold) result = 'LOCATION_VALID';
  // Without a trusted reference coordinate we cannot calculate whether the
  // customer is at the registered home. This is not proof of a mismatch.
  else if (!hasReferenceLocation || !precisionOk) result = 'MANUAL_REVIEW';
  else if ((distanceFromReferenceMeters != null && distanceFromReferenceMeters > config.homeRadiusMeters) || addressScore < 0.6 || !provinceMatch || !cityMatch) result = 'LOCATION_MISMATCH';
  if (result === 'LOCATION_VALID') reasonCodes.push('LOCATION_VALID');
  if (result === 'MANUAL_REVIEW') reasonCodes.push('MANUAL_REVIEW_REQUIRED');
  return { result, bestSample, sampleSpreadMeters: spreadMeters, distanceFromReferenceMeters, addressScore, provinceMatch, cityMatch, districtMatch, subdistrictMatch, streetScore, houseNumberMatch, reasonCodes, referencePrecision: address.referencePrecision, reverseGeocode };
}
