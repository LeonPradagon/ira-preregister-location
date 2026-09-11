import { describe, expect, it } from 'vitest';
import {
  shouldShowCustomerConfirmation,
  shouldAllowAddressChange,
  normalizeOptionalAddressValue,
  getMissingAddressFields,
  isVerificationCycleExhausted,
  shouldShowLocationRetry,
  shouldShowReminderPending,
  shouldShowReminderPickerOnLink,
  shouldShowReminderResume,
} from '../../src/lib/customerVerificationFlow';

describe('customer verification confirmation flow', () => {
  it('identifies only the missing required address fields', () => {
    expect(
      getMissingAddressFields({
        province: 'Jawa Barat',
        city: '',
        district: 'Coblong',
        subdistrict: 'Dago',
        street: 'Jl. Juanda',
      }),
    ).toEqual(['city']);
  });

  it('normalizes an empty optional house number without throwing', () => {
    expect(normalizeOptionalAddressValue(undefined)).toBe('');
    expect(normalizeOptionalAddressValue('  A-12  ')).toBe('A-12');
  });

  it('allows correcting an incomplete proposed address', () => {
    expect(shouldAllowAddressChange('PROPOSED', true)).toBe(true);
  });

  it('keeps a complete proposed address locked after its one change', () => {
    expect(shouldAllowAddressChange('PROPOSED', false)).toBe(false);
  });

  it('allows the first address change regardless of completeness', () => {
    expect(shouldAllowAddressChange('MASTER', false)).toBe(true);
    expect(shouldAllowAddressChange('MASTER', true)).toBe(true);
  });

  it.each(['CREATED', 'MESSAGE_SENT', 'LINK_OPENED', 'WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'])(
    'shows confirmation for an unconfirmed %s session',
    (status) => {
      expect(shouldShowCustomerConfirmation(status, 'UNCONFIRMED')).toBe(true);
    },
  );

  it('requires confirmation again after a customer submits a corrected address', () => {
    expect(shouldShowCustomerConfirmation('ADDRESS_PROPOSED', 'UNCONFIRMED')).toBe(true);
  });

  it('does not ask the customer to confirm the old name and address after a new address is submitted', () => {
    expect(shouldShowCustomerConfirmation('ADDRESS_PROPOSED', 'UNCONFIRMED', 'PROPOSED')).toBe(false);
  });

  it('does not show confirmation after the customer has confirmed', () => {
    expect(shouldShowCustomerConfirmation('WAITING_FOR_HOME', 'CONFIRMED')).toBe(false);
  });

  it('shows a retry action when the same link is reopened during an interrupted GPS capture', () => {
    expect(shouldShowLocationRetry('GPS_CAPTURING', 'CONFIRMED')).toBe(true);
  });

  it('keeps location verification available after reminders have been scheduled', () => {
    expect(shouldShowLocationRetry('REMINDER_LIMIT_REACHED', 'CONFIRMED')).toBe(true);
  });

  it('ends the verification cycle when the final reminder link is opened after GPS attempts are exhausted', () => {
    expect(isVerificationCycleExhausted('REMINDER_LIMIT_REACHED', 0, 3)).toBe(true);
  });

  it('does not end the cycle when only the reminder limit has been reached', () => {
    expect(isVerificationCycleExhausted('REMINDER_LIMIT_REACHED', 0, 2)).toBe(false);
  });

  it('does not show the verification button on the original link after a reminder is selected', () => {
    expect(shouldShowReminderResume('WAITING_FOR_HOME', 'CONFIRMED', 1, false, false)).toBe(false);
  });

  it('shows a waiting state on the original link after a reminder is selected', () => {
    expect(shouldShowReminderPending('WAITING_FOR_HOME', 'CONFIRMED', 1, false, false)).toBe(true);
    expect(shouldShowReminderPending('WAITING_FOR_HOME', 'CONFIRMED', 1, false, true)).toBe(true);
  });

  it('clears the waiting state only when a new reminder link is opened', () => {
    expect(shouldShowReminderPending('WAITING_FOR_HOME', 'CONFIRMED', 1, true, false)).toBe(false);
  });

  it('waits for the next link after the current reminder link schedules another reminder', () => {
    expect(shouldShowReminderPending('LOCATION_MISMATCH', 'CONFIRMED', 2, true, false, false)).toBe(true);
  });

  it('shows a pending reminder state when the second reminder link already scheduled the third reminder', () => {
    expect(shouldShowReminderPending('REMINDER_LIMIT_REACHED', 'CONFIRMED', 3, true, false, false)).toBe(true);
  });

  it('does not show a pending reminder state on the third reminder link itself', () => {
    expect(shouldShowReminderPending('REMINDER_LIMIT_REACHED', 'CONFIRMED', 3, true, false, true)).toBe(false);
  });

  it('shows the verification button only when a unique reminder link is opened', () => {
    expect(shouldShowReminderResume('WAITING_FOR_HOME', 'CONFIRMED', 1, true, false)).toBe(true);
    expect(shouldShowReminderResume('WAITING_FOR_HOME', 'CONFIRMED', 2, true, false, false)).toBe(false);
  });

  it.each([1, 2])('keeps the next reminder picker available on reminder link %s', (reminderCount) => {
    expect(shouldShowReminderPickerOnLink('WAITING_FOR_HOME', 'CONFIRMED', reminderCount, true, false)).toBe(true);
  });

  it('does not offer another reminder after the third reminder', () => {
    expect(shouldShowReminderPickerOnLink('REMINDER_LIMIT_REACHED', 'CONFIRMED', 3, true, false)).toBe(false);
  });

  it('does not offer another reminder after this link already scheduled one', () => {
    expect(shouldShowReminderPickerOnLink('WAITING_FOR_HOME', 'CONFIRMED', 2, true, false, 3, false)).toBe(false);
  });
});
