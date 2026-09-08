import { createHash, createHmac } from 'node:crypto';

export interface MekariHmacOptions {
  method: string;
  pathWithQuery?: string;
  clientId: string;
  clientSecret: string;
  date?: string;
}

/**
 * Mekari signs the RFC 7231 Date header and the HTTP request-line.
 * The path must include the query string when one is present.
 */
export function createMekariHmacHeaders(options: MekariHmacOptions): Record<string, string> {
  const date = options.date ?? new Date().toUTCString();
  const pathWithQuery = options.pathWithQuery || '/';
  const requestLine = `${options.method.toUpperCase()} ${pathWithQuery} HTTP/1.1`;
  const signingPayload = [`date: ${date}`, requestLine].join('\n');
  const signature = createHmac('sha256', options.clientSecret).update(signingPayload).digest('base64');

  return {
    accept: 'application/json',
    'content-type': 'application/json',
    date,
    authorization: `hmac username="${options.clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`,
  };
}

export function createMekariDigest(body: string): string {
  return `SHA-256=${createHash('sha256').update(body).digest('base64')}`;
}
