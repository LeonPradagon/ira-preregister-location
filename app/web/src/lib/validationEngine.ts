import {
  Coordinate,
  CustomerAddress,
  GpsSample,
  LocationValidationResult,
  ValidationConfig,
  ValidationResult,
} from '../types';

/**
 * Calculates geodesic distance in meters between two points using the Haversine formula
 * (Matches PostGIS ST_Distance(geography, geography) behavior).
 */
export function calculateGeodesicDistanceMeters(coord1: Coordinate, coord2: Coordinate): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;
  const lat1 = (coord1.latitude * Math.PI) / 180;
  const lat2 = (coord2.latitude * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;

  return Math.round(d * 10) / 10; // 1 decimal place precision for meters
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

/**
 * Normalizes Indonesian address strings according to PRD section 13.1
 */
export function normalizeAddressText(text: string): string {
  if (!text) return '';

  let normalized = text.toLowerCase().trim();

  // Replace common Indonesian road & administrative abbreviations
  const replacements: Array<[RegExp, string]> = [
    [/\bjl\b|\bjl\.\b|\bjln\b|\bjln\.\b/g, 'jalan'],
    [/\bkec\b|\bkec\.\b/g, 'kecamatan'],
    [/\bkel\b|\bkel\.\b/g, 'kelurahan'],
    [/\bgg\b|\bgg\.\b/g, 'gang'],
    [/\bno\b|\bno\.\b|\bnomor\b/g, 'no'],
    [/\bkomp\b|\bkomp\.\b|\bkomplek\b|\bkompleks\b/g, 'kompleks'],
    [/\bperum\b|\bperum\.\b|\bperumahan\b/g, 'perumahan'],
    [/\bkav\b|\bkav\.\b|\bkavling\b/g, 'kavling'],
    [/\bblok\b/g, 'blok'],
    [/\bdki\b|\bdki jakarta\b/g, 'jakarta'],
    [/\bjend\b|\bjend\.\b|\bjenderal\b/g, 'jenderal'],
    [/\bdr\b|\bdr\.\b/g, 'dokter'],
    [/\bprof\b|\bprof\.\b/g, 'profesor'],
    [/[^\w\s]/g, ' '], // Remove punctuation
    [/\s+/g, ' '], // Collapse multiple spaces
  ];

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.trim();
}

/**
 * Computes token similarity score (0.0 to 1.0)
 */
export function calculateTokenSimilarity(strA: string, strB: string): number {
  const normA = normalizeAddressText(strA);
  const normB = normalizeAddressText(strB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const tokensA = new Set(normA.split(' ').filter(Boolean));
  const tokensB = new Set(normB.split(' ').filter(Boolean));

  let intersectionCount = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      intersectionCount++;
    } else {
      // Partial token substring matching for numbers/blocks
      tokensB.forEach((bToken) => {
        if (bToken.includes(token) || token.includes(bToken)) {
          intersectionCount += 0.5;
        }
      });
    }
  });

  const unionSize = Math.max(tokensA.size, tokensB.size);
  const score = unionSize > 0 ? intersectionCount / unionSize : 0;
  return Math.min(1.0, Math.round(score * 100) / 100);
}

/**
 * Evaluates best sample from GPS multi-samples
 */
export function evaluateBestGpsSample(samples: GpsSample[]): {
  bestSample: GpsSample;
  averageAccuracy: number;
  isConsistent: boolean;
} {
  if (!samples || samples.length < 3 || samples.length > 5) {
    throw new Error('GPS capture must contain between 3 and 5 samples');
  }

  if (samples.some((sample) => !isValidCoordinate(sample))) {
    throw new Error('GPS sample contains an invalid latitude, longitude, or accuracy');
  }

  // Sort by accuracy (lower meter value is better)
  const sorted = [...samples].sort((a, b) => a.accuracyMeters - b.accuracyMeters);
  const bestSample = sorted[0];

  const avgAcc = samples.reduce((acc, s) => acc + s.accuracyMeters, 0) / samples.length;

  // Check consistency: distance between all points should not exceed max accuracy
  let maxInterDistance = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const dist = calculateGeodesicDistanceMeters(samples[i], samples[j]);
      if (dist > maxInterDistance) maxInterDistance = dist;
    }
  }

  const isConsistent = maxInterDistance <= 100; // within 100m inter-sample cluster

  return {
    bestSample,
    averageAccuracy: Math.round(avgAcc * 10) / 10,
    isConsistent,
  };
}

/**
 * Builds Google Maps deep link URL
 */
export function buildGoogleMapsDeepLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

/**
 * Formats coordinates for display (6 decimals)
 */
export function formatCoordinatePair(latitude: number, longitude: number, decimals: number = 6): string {
  return `${latitude.toFixed(decimals)}, ${longitude.toFixed(decimals)}`;
}

export interface ReverseGeocodeResult {
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  street: string;
  houseNumber?: string;
  postalCode?: string;
  formattedAddress: string;
}

/**
 * Core validation decision engine implementing hard rules and weighted signals
   * (PRD Section 14, 15, 16).
   *
   * This pure function is intentionally shared by the demo adapter and the
   * future API. In production the API must be the only caller that persists
   * the returned decision; the browser must only submit evidence.
 */
export function runValidationDecisionEngine(
  samples: GpsSample[],
  targetAddress: CustomerAddress,
  reverseGeocode: ReverseGeocodeResult,
  config: ValidationConfig,
  sessionId: string,
  captureId: string
): ValidationResult {
  const reasonCodes: string[] = [];
  const { bestSample, isConsistent } = evaluateBestGpsSample(samples);

  const lat = bestSample.latitude;
  const lng = bestSample.longitude;
  const accuracy = bestSample.accuracyMeters;

  // 1. GPS Quality Check
  if (accuracy > config.GPS_MAX_ACCURACY_METERS) {
    reasonCodes.push('LOW_GPS_ACCURACY');
  }

  if (!isConsistent) {
    reasonCodes.push('GPS_SAMPLE_INCONSISTENT');
  }

  // 2. Reference Location Precision Check
  const precision = targetAddress.referencePrecision;
  const isPreciseReference =
    precision === 'EXACT_MASTER' || precision === 'ROOFTOP' || precision === 'HOUSE';

  if (!isPreciseReference) {
    reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE');
  }

  // 3. PostGIS Geodesic Distance Check
  const distanceM = calculateGeodesicDistanceMeters(bestSample, targetAddress.referenceLocation);

  const homeRadiusExceeded = distanceM > config.HOME_RADIUS_METERS;
  if (homeRadiusExceeded) {
    reasonCodes.push('HOME_RADIUS_EXCEEDED');
  }

  // 4. Address Matching (Hard Rules & Weighted Signals)
  const normTargetProv = normalizeAddressText(targetAddress.province);
  const normRevProv = normalizeAddressText(reverseGeocode.province);
  const provinceMatch =
    normTargetProv === normRevProv ||
    normTargetProv.includes(normRevProv) ||
    normRevProv.includes(normTargetProv);
  if (!provinceMatch) reasonCodes.push('PROVINCE_MISMATCH');

  const normTargetCity = normalizeAddressText(targetAddress.city);
  const normRevCity = normalizeAddressText(reverseGeocode.city);
  const cityMatch =
    normTargetCity === normRevCity ||
    normTargetCity.includes(normRevCity) ||
    normRevCity.includes(normTargetCity);
  if (!cityMatch) reasonCodes.push('CITY_MISMATCH');

  const districtMatch =
    calculateTokenSimilarity(targetAddress.district, reverseGeocode.district) >= 0.7;
  if (!districtMatch) reasonCodes.push('DISTRICT_MISMATCH');

  const subdistrictMatch =
    calculateTokenSimilarity(targetAddress.subdistrict, reverseGeocode.subdistrict) >= 0.7;
  if (!subdistrictMatch) reasonCodes.push('SUBDISTRICT_MISMATCH');

  // Street score
  const streetScore = calculateTokenSimilarity(targetAddress.street, reverseGeocode.street);
  if (streetScore < config.STREET_MATCH_THRESHOLD) {
    reasonCodes.push('STREET_MISMATCH');
  }

  // House number match
  let houseNumberMatch: boolean | undefined = undefined;
  if (targetAddress.houseNumber && reverseGeocode.houseNumber) {
    houseNumberMatch =
      normalizeAddressText(targetAddress.houseNumber) ===
      normalizeAddressText(reverseGeocode.houseNumber);
    if (!houseNumberMatch) {
      reasonCodes.push('HOUSE_NUMBER_MISMATCH');
    }
  }

  // Weighted Address Score calculation
  // District: 20%, Subdistrict: 25%, Street: 35%, House: 20%
  let totalWeight = 0;
  let weightedScore = 0;

  // District 20%
  weightedScore += (districtMatch ? 1.0 : 0) * 0.2;
  totalWeight += 0.2;

  // Subdistrict 25%
  weightedScore += (subdistrictMatch ? 1.0 : 0) * 0.25;
  totalWeight += 0.25;

  // Street 35%
  weightedScore += streetScore * 0.35;
  totalWeight += 0.35;

  // House 20%
  if (houseNumberMatch !== undefined) {
    weightedScore += (houseNumberMatch ? 1.0 : 0) * 0.2;
    totalWeight += 0.2;
  } else {
    // If no house number, normalize weight
    weightedScore = weightedScore / (totalWeight || 1);
    totalWeight = 1.0;
  }

  const finalAddressScore = Math.min(1.0, Math.round(weightedScore * 100) / 100);

  // Determine Final Result
  let result: LocationValidationResult;

  if (accuracy > config.GPS_MAX_ACCURACY_METERS) {
    result = 'LOW_GPS_ACCURACY';
  } else if (!isPreciseReference) {
    result = 'MANUAL_REVIEW';
    reasonCodes.push('MANUAL_REVIEW_REQUIRED');
  } else if (
    provinceMatch &&
    cityMatch &&
    districtMatch &&
    subdistrictMatch &&
    !homeRadiusExceeded &&
    finalAddressScore >= config.ADDRESS_SCORE_THRESHOLD
  ) {
    result = 'LOCATION_VALID';
    reasonCodes.push('LOCATION_VALID');
  } else if (homeRadiusExceeded) {
    result = 'LOCATION_MISMATCH';
    reasonCodes.push('LOCATION_MISMATCH');
  } else if (finalAddressScore < 0.6) {
    result = 'LOCATION_MISMATCH';
  } else {
    result = 'MANUAL_REVIEW';
    reasonCodes.push('MANUAL_REVIEW_REQUIRED');
  }

  return {
    id: `val-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sessionId,
    captureId,
    addressId: targetAddress.id,
    provinceMatch,
    cityMatch,
    districtMatch,
    subdistrictMatch,
    streetScore,
    houseNumberMatch,
    gpsAccuracyM: accuracy,
    distanceToReferenceM: distanceM,
    addressScore: finalAddressScore,
    reverseGeocode,
    result,
    reasonCodes,
    referencePrecision: targetAddress.referencePrecision,
    engineVersion: '1.0.0',
    configVersion: '2026-08',
    capturedLocation: {
      latitude: lat,
      longitude: lng,
      accuracyMeters: accuracy,
      capturedAt: bestSample.capturedAt,
      coordinateText: formatCoordinatePair(lat, lng, config.COORDINATE_DISPLAY_DECIMALS),
      googleMapsUrl: buildGoogleMapsDeepLink(lat, lng),
    },
    referenceLocation: {
      latitude: targetAddress.referenceLocation.latitude,
      longitude: targetAddress.referenceLocation.longitude,
      precision: targetAddress.referencePrecision,
    },
    distanceFromReferenceMeters: distanceM,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Mask PII customer data for customer confirmation screen (PRD Section 7.1)
 */
export function maskCustomerName(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(' ');
  return parts
    .map((p) => {
      if (p.length <= 2) return p + '*';
      return p.substring(0, 3) + '*'.repeat(Math.max(3, p.length - 3));
    })
    .join(' ');
}

export function maskPhoneNumber(phone: string): string {
  if (!phone) return '';
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.length <= 4) return '******' + clean;
  return '******' + clean.slice(-4);
}

export function maskAddress(address: string, district?: string, city?: string): string {
  if (!address) return '';
  const prefix = address.substring(0, Math.min(14, address.length));
  const locationSuffix = [district, city].filter(Boolean).join(', ');
  return `${prefix}**, ${locationSuffix || '...'}`;
}
