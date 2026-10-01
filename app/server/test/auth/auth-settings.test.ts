import { describe, expect, it } from 'vitest';
import { emailAndPasswordSettings } from '../../src/auth/auth-settings.js';

describe('email/password authentication settings', () => {
  it('allows password login but prohibits public account registration', () => {
    expect(emailAndPasswordSettings).toEqual({ enabled: true, disableSignUp: true });
  });
});
