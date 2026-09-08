import { Coordinate, GpsSample } from '../types';

export function calculateGeodesicDistanceMeters(coord1: Coordinate, coord2: Coordinate): number {
  const earthRadius = 6371000;
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const lat1 = (coord1.latitude * Math.PI) / 180;
  const lat2 = (coord2.latitude * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

export function isValidCoordinate(sample: Pick<GpsSample, 'latitude' | 'longitude' | 'accuracyMeters'>): boolean {
  return (
    Number.isFinite(sample.latitude) &&
    sample.latitude >= -90 &&
    sample.latitude <= 90 &&
    Number.isFinite(sample.longitude) &&
    sample.longitude >= -180 &&
    sample.longitude <= 180 &&
    Number.isFinite(sample.accuracyMeters) &&
    sample.accuracyMeters > 0
  );
}

export function evaluateBestGpsSample(samples: GpsSample[]): {
  bestSample: GpsSample;
  averageAccuracy: number;
  isConsistent: boolean;
  sampleSpreadMeters: number;
} {
  if (samples.length < 3 || samples.length > 5) throw new Error('GPS capture must contain between 3 and 5 samples');
  if (samples.some((sample) => !isValidCoordinate(sample)))
    throw new Error('GPS sample contains an invalid latitude, longitude, or accuracy');
  const bestSample = [...samples].sort((a, b) => a.accuracyMeters - b.accuracyMeters)[0];
  const averageAccuracy =
    Math.round((samples.reduce((total, sample) => total + sample.accuracyMeters, 0) / samples.length) * 10) / 10;
  let maximumSpread = 0;
  for (let left = 0; left < samples.length; left += 1)
    for (let right = left + 1; right < samples.length; right += 1)
      maximumSpread = Math.max(maximumSpread, calculateGeodesicDistanceMeters(samples[left], samples[right]));
  return {
    bestSample,
    averageAccuracy,
    isConsistent: maximumSpread <= 100,
    sampleSpreadMeters: Math.round(maximumSpread * 10) / 10,
  };
}

export function buildGoogleMapsDeepLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

const plusCodePattern =
  /[23456789cfghjmpqrvwx]{4,8}\+(?:[23456789cfghjmpqrvwx]{3}\d|[23456789cfghjmpqrvwx]{4})(?=$|[\s,])|[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,3}/i;

/** Display the human-readable address while retaining the original Plus Code in the database. */
export function formatAddressForDisplay(rawAddress?: string): string {
  return (rawAddress ?? '')
    .split(',')
    .map((part) => part.replace(plusCodePattern, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

export function isIncompleteAddress(address: {
  rawAddress?: string;
  postalCode?: string;
  street?: string;
  houseNumber?: string;
}): boolean {
  const values = [address.postalCode, address.street, address.houseNumber];
  const hasPlaceholder = values.some(
    (value) =>
      !value?.trim() ||
      ['unknown', 'tidak diketahui', 'tanpa nomor', 'n/a', 'na', '-', '00000'].includes(value.trim().toLowerCase()),
  );
  const streetIsOnlyPlusCode = Boolean(
    address.street
      ?.trim()
      .match(/^[23456789cfghjmpqrvwx]{4,8}\+(?:[23456789cfghjmpqrvwx]{3}\d|[23456789cfghjmpqrvwx]{4})$/i),
  );
  return hasPlaceholder || streetIsOnlyPlusCode;
}

export function formatCoordinatePair(latitude: number, longitude: number, decimals = 6): string {
  return `${latitude.toFixed(decimals)}, ${longitude.toFixed(decimals)}`;
}
