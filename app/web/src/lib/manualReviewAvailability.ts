import type { ReviewDecision } from '../types';

const manualReviewStatuses = new Set([
  'MANUAL_REVIEW',
  'GPS_CAPTURING',
  'LOW_GPS_ACCURACY',
  'LOCATION_MISMATCH',
  'ADDRESS_PROPOSED',
  'REMINDER_LIMIT_REACHED',
]);

const manualActionStatuses = new Set([
  'LINK_OPENED',
  'CONSENTED',
  'CUSTOMER_DATA_MISMATCH',
  'GPS_CAPTURING',
  'LOW_GPS_ACCURACY',
  'LOCATION_MISMATCH',
  'WAITING_FOR_HOME',
  'REMINDER_REQUIRED',
  'REMINDER_LIMIT_REACHED',
  'ADDRESS_EDITING',
  'ADDRESS_PROPOSED',
  'MANUAL_REVIEW',
]);

const manualRejectStatuses = new Set([
  'MANUAL_REVIEW',
  'GPS_CAPTURING',
  'LOW_GPS_ACCURACY',
  'LOCATION_MISMATCH',
  'ADDRESS_PROPOSED',
  'REMINDER_LIMIT_REACHED',
]);

const manualRetryStatuses = new Set([
  'CONSENTED',
  'GPS_CAPTURING',
  'LOW_GPS_ACCURACY',
  'LOCATION_MISMATCH',
  'WAITING_FOR_HOME',
  'REMINDER_LIMIT_REACHED',
  'ADDRESS_EDITING',
  'ADDRESS_PROPOSED',
  'MANUAL_REVIEW',
]);

const manualAddressUpdateStatuses = new Set([
  'LINK_OPENED',
  'CONSENTED',
  'CUSTOMER_DATA_MISMATCH',
  'GPS_CAPTURING',
  'LOW_GPS_ACCURACY',
  'LOCATION_MISMATCH',
  'WAITING_FOR_HOME',
  'REMINDER_REQUIRED',
  'REMINDER_LIMIT_REACHED',
  'ADDRESS_EDITING',
  'ADDRESS_PROPOSED',
  'MANUAL_REVIEW',
]);

export function isManualReviewAvailable(status: string): boolean {
  return manualReviewStatuses.has(status);
}

export function isManualActionAvailable(status: string): boolean {
  return manualActionStatuses.has(status);
}

export function getManualReviewDecisions(status: string, hasValidationResult: boolean): ReviewDecision[] {
  const decisions: ReviewDecision[] = [];
  if (hasValidationResult && isManualReviewAvailable(status)) decisions.push('APPROVE');
  if (hasValidationResult && manualRejectStatuses.has(status)) decisions.push('REJECT');
  if (manualRetryStatuses.has(status)) decisions.push('REQUEST_RETRY');
  if (manualAddressUpdateStatuses.has(status)) decisions.push('REQUEST_ADDRESS_UPDATE');
  return decisions;
}

export type ManualReviewReasonOption = {
  value: string;
  label: string;
};

const manualReviewReasonOptions: Record<ReviewDecision, ManualReviewReasonOption[]> = {
  APPROVE: [
    { value: 'MANUAL_APPROVAL_PRECISION_PASS', label: 'Lokasi sesuai dengan alamat' },
    { value: 'STREET_ALIAS_VERIFIED', label: 'Nama jalan sesuai atau merupakan alias' },
  ],
  REJECT: [
    { value: 'LOCATION_MISMATCH_REJECTED', label: 'Lokasi tidak sesuai dengan alamat' },
    { value: 'GPS_ACCURACY_INSUFFICIENT', label: 'Akurasi GPS tidak cukup untuk menyetujui' },
  ],
  REQUEST_RETRY: [
    { value: 'GPS_RETRY_REQUESTED_BY_OPS', label: 'Titik GPS perlu diambil ulang' },
    { value: 'GPS_ACCURACY_INSUFFICIENT', label: 'Akurasi GPS belum cukup meyakinkan' },
  ],
  REQUEST_ADDRESS_UPDATE: [
    { value: 'ADDRESS_UPDATE_REQUIRED', label: 'Alamat perlu diperbarui oleh customer' },
    { value: 'STREET_ALIAS_VERIFIED', label: 'Nama jalan atau nomor rumah perlu dikonfirmasi' },
  ],
};

export function getManualReviewReasonOptions(decision: ReviewDecision): ManualReviewReasonOption[] {
  return manualReviewReasonOptions[decision];
}

export function getDefaultManualReviewReason(decision: ReviewDecision): string {
  return getManualReviewReasonOptions(decision)[0].value;
}
