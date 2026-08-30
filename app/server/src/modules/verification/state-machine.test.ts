import { describe, expect, it } from 'vitest';
import { assertTransition } from './state-machine.js';

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
});
