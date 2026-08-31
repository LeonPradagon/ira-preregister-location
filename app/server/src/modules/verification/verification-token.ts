import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const TOKEN_BCRYPT_ROUNDS = Number(process.env.VERIFICATION_TOKEN_BCRYPT_ROUNDS ?? 12);

if (!Number.isInteger(TOKEN_BCRYPT_ROUNDS) || TOKEN_BCRYPT_ROUNDS < 10 || TOKEN_BCRYPT_ROUNDS > 15) {
  throw new Error('VERIFICATION_TOKEN_BCRYPT_ROUNDS must be an integer between 10 and 15');
}

export interface VerificationToken {
  rawToken: string;
  tokenId: string;
  tokenHash: string;
}

export async function createVerificationToken(): Promise<VerificationToken> {
  const tokenId = randomBytes(18).toString('hex');
  const secret = randomBytes(32).toString('base64url');
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
  if (!/^[a-f0-9]{36}$/.test(tokenId) || secret.length < 32) return null;
  return { tokenId, secret };
}

export async function verifyVerificationToken(rawToken: string, tokenHash: string): Promise<boolean> {
  const parsed = parseVerificationToken(rawToken);
  return parsed ? bcrypt.compare(parsed.secret, tokenHash) : false;
}
