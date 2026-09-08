import { afterEach, describe, expect, it, vi } from 'vitest';

const { poolOptions } = vi.hoisted(() => ({ poolOptions: vi.fn() }));

vi.mock('dotenv/config', () => ({}));
vi.mock('pg', () => ({
  Pool: class {
    constructor(options: unknown) {
      poolOptions(options);
    }
  },
}));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('database TLS configuration', () => {
  it.each([
    ['production', undefined, { rejectUnauthorized: true }],
    ['production', 'false', undefined],
    ['development', 'true', { rejectUnauthorized: true }],
    ['development', undefined, undefined],
  ])('uses the expected TLS mode for NODE_ENV=%s and DATABASE_SSL=%s', async (environment, ssl, expected) => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('DATABASE_SSL', ssl as string | undefined);
    await import('../../src/db/client.js');
    expect(poolOptions).toHaveBeenCalledWith(expect.objectContaining({ ssl: expected }));
  });
});
