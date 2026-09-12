import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createShortLinkCode,
  hashLegacyShortLinkCode,
  hashShortLinkCode,
  isShortLinkCode,
} from '../../../src/modules/verification/short-link.js';

const previousHmacSecret = process.env.SHORT_LINK_HMAC_SECRET;

describe('verification short links', () => {
  beforeAll(() => {
    process.env.SHORT_LINK_HMAC_SECRET = 'test-short-link-hmac-secret';
  });

  afterAll(() => {
    if (previousHmacSecret === undefined) delete process.env.SHORT_LINK_HMAC_SECRET;
    else process.env.SHORT_LINK_HMAC_SECRET = previousHmacSecret;
  });

  it('creates URL-safe 16-character codes', () => {
    const code = createShortLinkCode();

    expect(code).toHaveLength(16);
    expect(isShortLinkCode(code)).toBe(true);
    expect(code).not.toContain('.');
  });

  it('hashes the same code deterministically without storing the code', () => {
    const code = 'Abc123_-xYz9876Q';

    expect(hashShortLinkCode(code)).toBe(hashShortLinkCode(code));
    expect(hashShortLinkCode(code)).toHaveLength(64);
    expect(hashShortLinkCode(code)).not.toContain(code);
    expect(hashShortLinkCode(code)).not.toBe(hashLegacyShortLinkCode(code));
    expect(isShortLinkCode('not-a-valid-code!')).toBe(false);
  });
});
