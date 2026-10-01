import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  createRateLimitKey,
  enforceRateLimit,
  shouldSkipRateLimit,
} from '../../src/common/redis-rate-limit.middleware.js';

const request = (path: string, ip = '203.0.113.10', idempotencyKey?: string) =>
  ({
    ip,
    path,
    method: 'POST',
    headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
  }) as unknown as Request;

const response = () =>
  ({
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Response;

describe('Redis rate-limit policy', () => {
  it('does not let caller-controlled idempotency keys create new buckets', () => {
    const now = 1_800_000_000_000;
    const first = createRateLimitKey(request('/v1/admin/customers', '203.0.113.10', 'first'), 60, now);
    const second = createRateLimitKey(request('/v1/admin/customers', '203.0.113.10', 'random-second'), 60, now);

    expect(first).toBe(second);
  });

  it('keeps verification-token requests in one IP and route bucket', () => {
    const now = 1_800_000_000_000;
    const first = createRateLimitKey(request('/v1/public/verifications/token-a/location'), 60, now);
    const second = createRateLimitKey(request('/v1/public/verifications/token-b/location'), 60, now);

    expect(first).toBe(second);
  });

  it('separates clients by IP and leaves only liveness checks unmetered', () => {
    const now = 1_800_000_000_000;
    expect(createRateLimitKey(request('/v1/api/auth/sign-in/email', '203.0.113.10'), 60, now)).not.toBe(
      createRateLimitKey(request('/v1/api/auth/sign-in/email', '203.0.113.11'), 60, now),
    );
    expect(shouldSkipRateLimit('/v1/health/live')).toBe(true);
    expect(shouldSkipRateLimit('/v1/api/auth/sign-in/email')).toBe(false);
  });

  it('returns 429 and does not continue after limit is exceeded', async () => {
    const res = response();
    const next = vi.fn();
    const store = { incr: vi.fn().mockResolvedValue(4), expire: vi.fn() };

    await enforceRateLimit(request('/v1/api/auth/sign-in/email'), res, next, store, 60, 3, 1_800_000_000_000);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed with 503 if Redis is unavailable', async () => {
    const res = response();
    const next = vi.fn();
    const store = { incr: vi.fn().mockRejectedValue(new Error('Redis unavailable')), expire: vi.fn() };

    await enforceRateLimit(request('/v1/api/auth/sign-in/email'), res, next, store, 60, 3, 1_800_000_000_000);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'RATE_LIMIT_UNAVAILABLE' }));
    expect(next).not.toHaveBeenCalled();
  });
});
