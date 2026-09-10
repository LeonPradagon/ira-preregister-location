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
    const config = envSchema.parse({ ...required, GEOCODING_BASE_URL: '', WHATSAPP_BASE_URL: '' });
    expect(config.GEOCODING_BASE_URL).toBeUndefined();
    expect(config.WHATSAPP_BASE_URL).toBeUndefined();
  });

  it('requires a sufficiently long Better Auth secret', () => {
    expect(() => envSchema.parse({ ...required, BETTER_AUTH_SECRET: 'too-short' })).toThrow();
  });

  it('allows a WhatsApp daily limit up to 10,000 but rejects larger values', () => {
    expect(envSchema.parse({ ...required, WHATSAPP_DAILY_SEND_LIMIT: 10000 }).WHATSAPP_DAILY_SEND_LIMIT).toBe(10000);
    expect(() => envSchema.parse({ ...required, WHATSAPP_DAILY_SEND_LIMIT: 10001 })).toThrow();
  });
});
