import { createHash, createHmac, randomBytes } from 'node:crypto';

// 9 bytes encode to exactly 12 URL-safe Base64 characters (~72 bits).
// Keep accepting 16-character codes so links issued before this change remain valid.
const SHORT_LINK_CODE_BYTES = 9;
const shortLinkCodePattern = /^(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{16})$/;
const shortLinkHashContext = 'ira-preregister:verification-short-link:v1:';

export function createShortLinkCode(): string {
  return randomBytes(SHORT_LINK_CODE_BYTES).toString('base64url');
}

export function hashShortLinkCode(code: string): string {
  const secret = process.env.SHORT_LINK_HMAC_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) throw new Error('SHORT_LINK_HMAC_SECRET or BETTER_AUTH_SECRET must be configured');
  return createHmac('sha256', secret).update(`${shortLinkHashContext}${code}`, 'utf8').digest('hex');
}

/** Supports short links created before the HMAC hardening was enabled. */
export function hashLegacyShortLinkCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export function isShortLinkCode(code: string): boolean {
  return shortLinkCodePattern.test(code);
}
