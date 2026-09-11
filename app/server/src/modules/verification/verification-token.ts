import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const TOKEN_BCRYPT_ROUNDS = Number(process.env.VERIFICATION_TOKEN_BCRYPT_ROUNDS ?? 12);
const TOKEN_ID_BYTES = 12;
const TOKEN_SECRET_BYTES = 24;
const compactTokenIdPattern = /^[A-Za-z0-9_-]{16}$/;
const legacyTokenIdPattern = /^[a-f0-9]{36}$/;
const tokenSecretPattern = /^[A-Za-z0-9_-]{32,43}$/;

if (!Number.isInteger(TOKEN_BCRYPT_ROUNDS) || TOKEN_BCRYPT_ROUNDS < 10 || TOKEN_BCRYPT_ROUNDS > 15) {
  throw new Error('VERIFICATION_TOKEN_BCRYPT_ROUNDS must be an integer between 10 and 15');
}

export interface VerificationToken {
  rawToken: string;
  tokenId: string;
  tokenHash: string;
}

export async function createVerificationToken(): Promise<VerificationToken> {
  const tokenId = randomBytes(TOKEN_ID_BYTES).toString('base64url');
  const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
  return {
    rawToken: `${tokenId}.${secret}`,
    tokenId,
    tokenHash: await bcrypt.hash(secret, TOKEN_BCRYPT_ROUNDS),
  };
}

export async function hashVerificationSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, TOKEN_BCRYPT_ROUNDS);
}

export function parseVerificationToken(rawToken: string): { tokenId: string; secret: string } | null {
  const separator = rawToken.indexOf('.');
  if (separator <= 0 || separator === rawToken.length - 1) return null;
  const tokenId = rawToken.slice(0, separator);
  const secret = rawToken.slice(separator + 1);
  if ((!compactTokenIdPattern.test(tokenId) && !legacyTokenIdPattern.test(tokenId)) || !tokenSecretPattern.test(secret))
    return null;
  return { tokenId, secret };
}

export async function verifyVerificationToken(rawToken: string, tokenHash: string): Promise<boolean> {
  const parsed = parseVerificationToken(rawToken);
  return parsed ? bcrypt.compare(parsed.secret, tokenHash) : false;
}
