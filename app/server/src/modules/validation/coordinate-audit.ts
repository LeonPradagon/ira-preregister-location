import { administrativeMatch, normalizeAddress, tokenScore } from './engine.js';

export type CoordinateAuditStatus = 'PENDING' | 'MATCHED' | 'UNCERTAIN' | 'MISMATCH' | 'INVALID';

export interface CoordinateAuditAddress {
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  street: string;
}

export interface CoordinateAuditGeocode {
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  street: string;
  houseNumber?: string;
  postalCode?: string;
  formattedAddress: string;
  precision?: string;
  confidence?: number;
  provider?: string;
  providerPlaceId?: string;
}

export interface CoordinateAuditResult {
  status: Exclude<CoordinateAuditStatus, 'PENDING'>;
  reason: string;
  confidence: number;
  evidence: {
    matches: {
      province: boolean;
      city: boolean;
      district: boolean;
      subdistrict: boolean;
    };
    streetScore: number;
    reverseGeocode: CoordinateAuditGeocode;
  };
}

const meaningful = (value: string | undefined): boolean => {
  const normalized = normalizeAddress(value ?? '');
  return Boolean(normalized) && !['unknown', 'tidak diketahui', '00000', 'n a', 'na', '-'].includes(normalized);
};

/**
 * Compare an imported address with reverse-geocoded data from its coordinate.
 * Administrative mismatches are strong evidence; street differences remain
 * uncertain because rural Indonesian addresses often have no mapped road.
 */
export const auditCoordinateAddress = (
  address: CoordinateAuditAddress,
  reverseGeocode: CoordinateAuditGeocode,
): CoordinateAuditResult => {
  const matches = {
    province: administrativeMatch(address.province, [reverseGeocode.province]),
    city: administrativeMatch(address.city, [reverseGeocode.city]),
    district: administrativeMatch(address.district, [reverseGeocode.district]),
    subdistrict: administrativeMatch(address.subdistrict, [reverseGeocode.subdistrict]),
  };
  const streetScore = tokenScore(address.street, reverseGeocode.street);
  const missingReverseLevels = [
    meaningful(address.province) && !meaningful(reverseGeocode.province),
    meaningful(address.city) && !meaningful(reverseGeocode.city),
    meaningful(address.district) && !meaningful(reverseGeocode.district),
    meaningful(address.subdistrict) && !meaningful(reverseGeocode.subdistrict),
  ].filter(Boolean).length;
  const strongMismatch =
    !matches.province ||
    !matches.city ||
    !matches.district ||
    (meaningful(reverseGeocode.subdistrict) && !matches.subdistrict);
  const streetComparable = meaningful(address.street) && meaningful(reverseGeocode.street);

  let status: CoordinateAuditResult['status'] = 'MATCHED';
  let reason = 'Wilayah administrasi dan nama jalan sesuai dengan koordinat.';
  let confidence = 0.95;
  if (strongMismatch) {
    status = 'MISMATCH';
    reason = 'Koordinat berada di wilayah administrasi yang berbeda dari alamat.';
    confidence = 0.9;
  } else if (missingReverseLevels > 0 || (streetComparable && streetScore < 0.45) || !streetComparable) {
    status = 'UNCERTAIN';
    reason = !streetComparable
      ? 'Wilayah cocok, tetapi data peta belum menyediakan nama jalan yang cukup untuk memastikan titik exact.'
      : 'Wilayah cocok, tetapi nama jalan dari data alamat dan peta belum cukup mirip.';
    confidence = 0.7;
  } else if (streetScore < 0.7) {
    status = 'UNCERTAIN';
    reason = 'Wilayah cocok, tetapi nama jalan memiliki variasi penulisan.';
    confidence = 0.8;
  }

  return {
    status,
    reason,
    confidence,
    evidence: { matches, streetScore, reverseGeocode },
  };
};
