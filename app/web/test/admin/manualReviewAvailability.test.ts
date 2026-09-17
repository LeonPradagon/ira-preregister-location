import { describe, expect, it } from 'vitest';
import {
  getManualReviewDecisions,
  isManualActionAvailable,
  isManualReviewAvailable,
} from '../../src/lib/manualReviewAvailability';

describe('manual review availability', () => {
  it.each([
    'MANUAL_REVIEW',
    'GPS_CAPTURING',
    'LOW_GPS_ACCURACY',
    'LOCATION_MISMATCH',
    'ADDRESS_PROPOSED',
    'REMINDER_LIMIT_REACHED',
  ])(
    'allows manual review for %s',
    (status) => {
      expect(isManualReviewAvailable(status)).toBe(true);
    },
  );

  it.each(['ADDRESS_EDITING', 'WAITING_FOR_HOME', 'REMINDER_REQUIRED', 'CUSTOMER_DATA_MISMATCH'])(
    'does not allow manual review for %s',
    (status) => {
      expect(isManualReviewAvailable(status)).toBe(false);
    },
  );

  it.each([
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
  ])('exposes a safe manual action for %s', (status) => {
    expect(isManualActionAvailable(status)).toBe(true);
  });

  it.each(['CREATED', 'MESSAGE_SENT', 'LOCATION_VALID', 'EXPIRED'])('does not expose manual action for %s', (status) => {
    expect(isManualActionAvailable(status)).toBe(false);
  });

  it('only offers approval when the status has a recorded GPS result', () => {
    expect(getManualReviewDecisions('REMINDER_LIMIT_REACHED', true)).toContain('APPROVE');
    expect(getManualReviewDecisions('REMINDER_LIMIT_REACHED', false)).not.toContain('APPROVE');
    expect(getManualReviewDecisions('ADDRESS_EDITING', true)).not.toContain('APPROVE');
  });
});
