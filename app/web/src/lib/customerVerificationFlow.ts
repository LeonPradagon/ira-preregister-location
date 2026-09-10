const confirmationStatuses = [
  'CREATED',
  'MESSAGE_SENT',
  'LINK_OPENED',
  'ADDRESS_PROPOSED',
  'WAITING_FOR_HOME',
  'REMINDER_LIMIT_REACHED',
];

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
  maxReminders = 3,
): boolean {
  const normalizedStatus = String(status || '')
    .trim()
    .toUpperCase();
  const normalizedConfirmationStatus = String(confirmationStatus || '')
    .trim()
    .toUpperCase();
  return (
    reminderScheduledNow ||
    (isReminderLink && !canScheduleReminder && reminderCount < maxReminders) ||
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
