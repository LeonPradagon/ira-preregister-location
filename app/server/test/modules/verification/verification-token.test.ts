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
    expect(parseVerificationToken(token.rawToken)).toEqual(expect.objectContaining({ tokenId: token.tokenId }));
    expect(token.tokenHash).not.toContain(token.rawToken);
    await expect(verifyVerificationToken(token.rawToken, token.tokenHash)).resolves.toBe(true);
    await expect(verifyVerificationToken(`${token.tokenId}.wrong-secret`, token.tokenHash)).resolves.toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(parseVerificationToken('not-a-token')).toBeNull();
    expect(parseVerificationToken('not-a-valid-id.secret')).toBeNull();
  });
});
