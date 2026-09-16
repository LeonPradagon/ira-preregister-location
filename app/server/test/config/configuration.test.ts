import { describe, expect, it } from 'vitest';
import { envSchema } from '../../src/config/configuration.js';

const required = {
  DATABASE_URL: 'postgresql://localhost/ira_preregist',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'local-development-secret-change-me-at-least-32-chars',
  BETTER_AUTH_URL: 'http://localhost:3000',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('runtime configuration', () => {
  it('treats blank optional provider settings as disabled', () => {
    const config = envSchema.parse({
      ...required,
      GOOGLE_GEOCODING_API_KEY: '',
      GOOGLE_GEOCODING_BASE_URL: '',
      GEOCODING_BASE_URL: '',
      WHATSAPP_BASE_URL: '',
    });
    expect(config.GOOGLE_GEOCODING_API_KEY).toBeUndefined();
    expect(config.GOOGLE_GEOCODING_BASE_URL).toBeUndefined();
    expect(config.GEOCODING_BASE_URL).toBeUndefined();
    expect(config.WHATSAPP_BASE_URL).toBeUndefined();
    expect(config.GEOCODING_PRIMARY).toBe('OSM');
  });

  it('accepts only the supported geocoding primary providers', () => {
    expect(envSchema.parse({ ...required, GEOCODING_PRIMARY: 'OSM' }).GEOCODING_PRIMARY).toBe('OSM');
    expect(envSchema.parse({ ...required, GEOCODING_PRIMARY: 'GOOGLE' }).GEOCODING_PRIMARY).toBe('GOOGLE');
    expect(() => envSchema.parse({ ...required, GEOCODING_PRIMARY: 'INVALID' })).toThrow();
  });

  it('requires a sufficiently long Better Auth secret', () => {
    expect(() => envSchema.parse({ ...required, BETTER_AUTH_SECRET: 'too-short' })).toThrow();
  });

  it('allows a WhatsApp daily limit up to 10,000 but rejects larger values', () => {
    expect(envSchema.parse({ ...required, WHATSAPP_DAILY_SEND_LIMIT: 10000 }).WHATSAPP_DAILY_SEND_LIMIT).toBe(10000);
    expect(() => envSchema.parse({ ...required, WHATSAPP_DAILY_SEND_LIMIT: 10001 })).toThrow();
  });

  it('allows automatic approval thresholds from 80% through 100%', () => {
    expect(
      envSchema.parse({ ...required, AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD: 0.8 })
        .AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD,
    ).toBe(0.8);
    expect(() => envSchema.parse({ ...required, AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD: 0.79 })).toThrow();
  });
});
