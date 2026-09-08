const confirmationStatuses = ['CREATED', 'MESSAGE_SENT', 'LINK_OPENED', 'WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'];

export function shouldShowCustomerConfirmation(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
): boolean {
  const normalizedStatus = String(status || 'LINK_OPENED')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || 'UNCONFIRMED')
    .trim()
    .toUpperCase();
  return normalizedConfirmationStatus !== 'CONFIRMED' && confirmationStatuses.includes(normalizedStatus);
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

export function shouldShowReminderResume(
  status: string | null | undefined,
  confirmationStatus: string | null | undefined,
  reminderCount: number,
  isReminderLink: boolean,
  busy: boolean,
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
    reminderCount > 0 &&
    normalizedConfirmationStatus === 'CONFIRMED' &&
    ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(normalizedStatus)
  );
}
