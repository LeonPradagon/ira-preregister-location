const confirmationStatuses = [
  'CREATED',
  'MESSAGE_SENT',
  'LINK_OPENED',
  'ADDRESS_PROPOSED',
  'WAITING_FOR_HOME',
  'REMINDER_LIMIT_REACHED',
];

const locationMatchDetailStatuses = [
  'LOCATION_VALID',
  'LOCATION_MISMATCH',
  'LOW_GPS_ACCURACY',
  'WAITING_FOR_HOME',
  'REMINDER_REQUIRED',
  'REMINDER_LIMIT_REACHED',
  'MANUAL_REVIEW',
];

export const requiredAddressFields = ['province', 'city', 'district', 'subdistrict', 'street'] as const;

export function getMissingAddressFields(address: Partial<Record<string, string>>): string[] {
  return requiredAddressFields.filter((field) => !String(address[field] ?? '').trim());
}

export function normalizeOptionalAddressValue(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

export function shouldAllowAddressChange(
  addressType: string | null | undefined,
  requiresCorrection = false,
): boolean {
  const normalizedAddressType = String(addressType || '')
    .trim()
    .toUpperCase();
  return normalizedAddressType !== 'PROPOSED' || requiresCorrection;
}

export function shouldShowCustomerConfirmation(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
  addressType: string | null | undefined = undefined,
): boolean {
  const normalizedStatus = String(status || 'LINK_OPENED')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || 'UNCONFIRMED')
    .trim()
    .toUpperCase();
  const normalizedAddressType = String(addressType || '')
    .trim()
    .toUpperCase();
  return (
    normalizedConfirmationStatus !== 'CONFIRMED' &&
    confirmationStatuses.includes(normalizedStatus) &&
    normalizedAddressType !== 'PROPOSED'
  );
}

export function shouldShowLocationRetry(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || '')
    .trim()
    .toUpperCase();
  return (
    normalizedConfirmationStatus === 'CONFIRMED' &&
    ['GPS_CAPTURING', 'WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(normalizedStatus)
  );
}

export function shouldShowLocationMatchDetails(
  status: string | null | undefined,
  hasReverseGeocode: boolean,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  return hasReverseGeocode && locationMatchDetailStatuses.includes(normalizedStatus);
}

export function isVerificationCycleExhausted(
  status: string | null | undefined,
  attemptCount: number,
  reminderCount: number,
  maxAttempts = 3,
  maxReminders = 3,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  return (
    reminderCount >= maxReminders &&
    (attemptCount >= maxAttempts || normalizedStatus === 'REMINDER_LIMIT_REACHED')
  );
}

export function shouldShowReminderResume(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
  reminderCount: number,
  isReminderLink: boolean,
  busy: boolean,
  canScheduleReminder = true,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || '')
    .trim()
    .toUpperCase();
  return (
    !busy &&
    isReminderLink &&
    canScheduleReminder &&
    reminderCount > 0 &&
    normalizedConfirmationStatus === 'CONFIRMED' &&
    ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(normalizedStatus)
  );
}

export function shouldShowReminderPending(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
  reminderCount: number,
  isReminderLink: boolean,
  reminderScheduledNow: boolean,
  canScheduleReminder = true,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || '')
    .trim()
    .toUpperCase();
  return (
    reminderScheduledNow ||
    (isReminderLink && !canScheduleReminder) ||
    (!isReminderLink &&
      normalizedConfirmationStatus === 'CONFIRMED' &&
      reminderCount > 0 &&
      ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(normalizedStatus))
  );
}

export function shouldShowReminderPickerOnLink(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
  reminderCount: number,
  isReminderLink: boolean,
  busy: boolean,
  maxReminders = 3,
  canScheduleReminder = true,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || '')
    .trim()
    .toUpperCase();
  return (
    !busy &&
    isReminderLink &&
    canScheduleReminder &&
    normalizedConfirmationStatus === 'CONFIRMED' &&
    reminderCount > 0 &&
    reminderCount < maxReminders &&
    ['WAITING_FOR_HOME', 'REMINDER_REQUIRED', 'REMINDER_LIMIT_REACHED'].includes(normalizedStatus)
  );
}
