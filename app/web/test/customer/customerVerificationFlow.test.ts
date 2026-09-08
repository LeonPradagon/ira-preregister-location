import { describe, expect, it } from 'vitest';
import {
  shouldShowCustomerConfirmation,
  shouldShowLocationRetry,
  shouldShowReminderResume,
} from '../../src/lib/customerVerificationFlow';

describe('customer verification confirmation flow', () => {
  it.each(['CREATED', 'MESSAGE_SENT', 'LINK_OPENED', 'WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'])(
    'shows confirmation for an unconfirmed %s session',
    (status) => {
      expect(shouldShowCustomerConfirmation(status, 'UNCONFIRMED')).toBe(true);
    },
  );

  it('does not show confirmation after the customer has confirmed', () => {
    expect(shouldShowCustomerConfirmation('WAITING_FOR_HOME', 'CONFIRMED')).toBe(false);
  });

  it('shows a retry action when the same link is reopened during an interrupted GPS capture', () => {
    expect(shouldShowLocationRetry('GPS_CAPTURING', 'CONFIRMED')).toBe(true);
  });

  it('keeps location verification available after reminders have been scheduled', () => {
    expect(shouldShowLocationRetry('REMINDER_LIMIT_REACHED', 'CONFIRMED')).toBe(true);
  });

  it('does not show the verification button on the original link after a reminder is selected', () => {
    expect(shouldShowReminderResume('WAITING_FOR_HOME', 'CONFIRMED', 1, false, false)).toBe(false);
  });

  it('shows the verification button only when a unique reminder link is opened', () => {
    expect(shouldShowReminderResume('WAITING_FOR_HOME', 'CONFIRMED', 1, true, false)).toBe(true);
  });
});
