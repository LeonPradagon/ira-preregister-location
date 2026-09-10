import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getPublicWebOrigin } from '../../src/config/public-origin.js';

afterEach(() => {
  delete process.env.WEB_ORIGIN;
  delete process.env.WEB_ORIGIN_ENV_FILE;
});

describe('public web origin', () => {
  it('normalizes a configured tunnel URL before building links', () => {
    expect(getPublicWebOrigin({ WEB_ORIGIN: 'https://tunnel.example.test/' })).toBe('https://tunnel.example.test');
  });

  it('uses the latest process environment value at link creation time', () => {
    process.env.WEB_ORIGIN_ENV_FILE = '/dev/null';
    process.env.WEB_ORIGIN = 'https://old-tunnel.example.test';
    expect(getPublicWebOrigin()).toBe('https://old-tunnel.example.test');

    process.env.WEB_ORIGIN = 'https://new-tunnel.example.test/';
    expect(getPublicWebOrigin()).toBe('https://new-tunnel.example.test');
  });

  it('reloads WEB_ORIGIN when the local env file changes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ira-public-origin-'));
    const envPath = join(directory, '.env');
    process.env.WEB_ORIGIN_ENV_FILE = envPath;
    try {
      writeFileSync(envPath, 'WEB_ORIGIN=https://old-tunnel.example.test/\n');
      expect(getPublicWebOrigin()).toBe('https://old-tunnel.example.test');

      writeFileSync(envPath, 'WEB_ORIGIN=https://new-tunnel.example.test/\n');
      expect(getPublicWebOrigin()).toBe('https://new-tunnel.example.test');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects missing or unsupported origins', () => {
    expect(() => getPublicWebOrigin({})).toThrow('WEB_ORIGIN must be configured');
    expect(() => getPublicWebOrigin({ WEB_ORIGIN: 'ftp://tunnel.example.test' })).toThrow('must use http or https');
  });
});
