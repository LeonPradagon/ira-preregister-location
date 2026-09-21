export type ManualReviewCaseKey =
  | 'GPS_ACCURACY'
  | 'GPS_INCONSISTENT'
  | 'LOCATION_OUTSIDE_RADIUS'
  | 'ADDRESS_MISMATCH'
  | 'ADDRESS_INCOMPLETE'
  | 'REFERENCE_MISSING'
  | 'REFERENCE_IMPRECISE'
  | 'GEOCODING_UNAVAILABLE'
  | 'ROAD_ONLY_LOCATION'
  | 'CUSTOMER_DATA_MISMATCH'
  | 'ADDRESS_CHANGE'
  | 'RETRY_LIMIT_REACHED'
  | 'GPS_CAPTURE_PENDING'
  | 'REVIEW_REQUIRED';

const addressMismatchReasons = new Set([
  'PROVINCE_MISMATCH',
  'CITY_MISMATCH',
  'DISTRICT_MISMATCH',
  'SUBDISTRICT_MISMATCH',
  'STREET_MISMATCH',
  'STREET_VARIATION',
  'HOUSE_NUMBER_MISMATCH',
]);

/**
 * Converts engine reason codes and the session state into a small set of
 * operator-facing case labels. A session may have more than one case.
 */
export function getManualReviewCaseKeys(status: string, reasonCodes: string[] = []): ManualReviewCaseKey[] {
  const reasons = new Set(reasonCodes);
  const cases: ManualReviewCaseKey[] = [];
  const add = (key: ManualReviewCaseKey) => {
    if (!cases.includes(key)) cases.push(key);
  };

  if (status === 'CUSTOMER_DATA_MISMATCH') add('CUSTOMER_DATA_MISMATCH');
  if (['ADDRESS_EDITING', 'ADDRESS_PROPOSED'].includes(status)) add('ADDRESS_CHANGE');
  if (status === 'REMINDER_LIMIT_REACHED') add('RETRY_LIMIT_REACHED');
  if (['LINK_OPENED', 'CONSENTED', 'GPS_CAPTURING'].includes(status)) add('GPS_CAPTURE_PENDING');
  if (status === 'LOW_GPS_ACCURACY' || reasons.has('LOW_GPS_ACCURACY')) add('GPS_ACCURACY');
  if (status === 'WAITING_FOR_HOME' || reasons.has('GPS_SAMPLE_INCONSISTENT')) add('GPS_INCONSISTENT');
  if (reasons.has('HOME_RADIUS_EXCEEDED')) add('LOCATION_OUTSIDE_RADIUS');
  if ([...reasons].some((reason) => addressMismatchReasons.has(reason))) add('ADDRESS_MISMATCH');
  if (reasons.has('ADDRESS_INCOMPLETE')) add('ADDRESS_INCOMPLETE');
  if (reasons.has('REFERENCE_LOCATION_MISSING')) add('REFERENCE_MISSING');
  if (reasons.has('REFERENCE_LOCATION_NOT_PRECISE')) add('REFERENCE_IMPRECISE');
  if (reasons.has('GEOCODING_UNAVAILABLE')) add('GEOCODING_UNAVAILABLE');
  if (reasons.has('ROAD_ONLY_LOCATION')) add('ROAD_ONLY_LOCATION');
  if (status === 'LOCATION_MISMATCH' && cases.length === 0) add('LOCATION_OUTSIDE_RADIUS');
  if (status === 'MANUAL_REVIEW' && cases.length === 0) add('REVIEW_REQUIRED');

  return cases;
}
