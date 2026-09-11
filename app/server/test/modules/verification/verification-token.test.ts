import { describe, expect, it } from 'vitest';
import {
  createVerificationToken,
  parseVerificationToken,
  verifyVerificationToken,
} from '../../../src/modules/verification/verification-token.js';

describe('verification token', () => {
  it('creates a token that can be verified without storing the raw secret', async () => {
    const token = await createVerificationToken();

    expect(token.rawToken).toContain(`${token.tokenId}.`);
    expect(token.tokenId).toHaveLength(16);
    expect(token.rawToken.length).toBe(49);
    expect(parseVerificationToken(token.rawToken)).toEqual(expect.objectContaining({ tokenId: token.tokenId }));
    expect(token.tokenHash).not.toContain(token.rawToken);
    await expect(verifyVerificationToken(token.rawToken, token.tokenHash)).resolves.toBe(true);
    await expect(verifyVerificationToken(`${token.tokenId}.wrong-secret`, token.tokenHash)).resolves.toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(parseVerificationToken('not-a-token')).toBeNull();
    expect(parseVerificationToken('not-a-valid-id.secret')).toBeNull();
    expect(parseVerificationToken(`${'a'.repeat(36)}.${'a'.repeat(43)}`)).not.toBeNull();
    expect(parseVerificationToken(`${'a'.repeat(16)}.${'a'.repeat(32)}`)).not.toBeNull();
    expect(parseVerificationToken(`${'a'.repeat(16)}.${'<script>'.padEnd(32, 'x')}`)).toBeNull();
  });
});
