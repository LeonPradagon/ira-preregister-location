import { describe, expect, it } from 'vitest';
import { canRestartVerificationCycle } from '../../../src/modules/verification/verification-cycle.policy.js';

describe('verification cycle restart policy', () => {
  it('allows an admin to send a new link when both limits are exhausted', () => {
    expect(canRestartVerificationCycle('GPS_CAPTURING', 3, 3, 3, 3)).toBe(true);
    expect(canRestartVerificationCycle('WAITING_FOR_HOME', 3, 3, 3, 3)).toBe(true);
    expect(canRestartVerificationCycle('MANUAL_REVIEW', 3, 3, 3, 3)).toBe(true);
  });

  it('does not restart before both limits are exhausted or after verification succeeds', () => {
    expect(canRestartVerificationCycle('REMINDER_LIMIT_REACHED', 2, 3, 3, 3)).toBe(false);
    expect(canRestartVerificationCycle('REMINDER_LIMIT_REACHED', 3, 2, 3, 3)).toBe(false);
    expect(canRestartVerificationCycle('LOCATION_VALID', 3, 3, 3, 3)).toBe(false);
  });
});
