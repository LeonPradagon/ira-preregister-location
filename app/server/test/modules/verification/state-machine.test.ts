import { describe, expect, it } from 'vitest';
import { assertTransition } from '../../../src/modules/verification/state-machine.js';

describe('verification state machine', () => {
  it('allows the customer happy path', () => {
    expect(() => assertTransition('LINK_OPENED', 'CONSENTED')).not.toThrow();
    expect(() => assertTransition('CONSENTED', 'GPS_CAPTURING')).not.toThrow();
    expect(() => assertTransition('GPS_CAPTURING', 'LOCATION_VALID')).not.toThrow();
  });

  it('rejects skipping consent', () => {
    expect(() => assertTransition('LINK_OPENED', 'LOCATION_VALID')).toThrow('Invalid verification status transition');
  });

  it('allows a manual reminder to move an active session into waiting state', () => {
    expect(() => assertTransition('MESSAGE_SENT', 'WAITING_FOR_HOME')).not.toThrow();
    expect(() => assertTransition('CONSENTED', 'REMINDER_LIMIT_REACHED')).not.toThrow();
  });

  it('allows a reminder customer to confirm the same address and capture GPS', () => {
    expect(() => assertTransition('WAITING_FOR_HOME', 'GPS_CAPTURING')).not.toThrow();
    expect(() => assertTransition('REMINDER_LIMIT_REACHED', 'GPS_CAPTURING')).not.toThrow();
  });

  it('moves a reminder customer to address editing when the address changed', () => {
    expect(() => assertTransition('WAITING_FOR_HOME', 'ADDRESS_EDITING')).not.toThrow();
    expect(() => assertTransition('REMINDER_LIMIT_REACHED', 'ADDRESS_EDITING')).not.toThrow();
  });

  it('allows scheduling the final reminder range directly from a failed GPS result', () => {
    expect(() => assertTransition('LOCATION_MISMATCH', 'REMINDER_LIMIT_REACHED')).not.toThrow();
  });
});
