import { Injectable, type NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';

type RateLimitStore = Pick<Redis, 'incr' | 'expire'>;

export function createRateLimitKey(
  request: Pick<Request, 'ip' | 'path' | 'method'>,
  windowSeconds: number,
  timestamp = Date.now(),
): string {
  const identity = request.ip || 'unknown-client';
  const identityHash = createHash('sha256').update(identity).digest('hex');
  const bucket = Math.floor(timestamp / (windowSeconds * 1000));
  const routeGroup = request.path.includes('/public/verifications/')
    ? '/public/verifications'
    : request.path.split('/').slice(0, 3).join('/');
  const routeHash = createHash('sha256').update(routeGroup).digest('hex').slice(0, 16);
  return `rate-limit:${bucket}:${request.method}:${routeHash}:${identityHash}`;
}

export function shouldSkipRateLimit(path: string): boolean {
  return path === '/v1/health/live' || path === '/health/live';
}

export async function enforceRateLimit(
  request: Pick<Request, 'ip' | 'path' | 'method'>,
  response: Pick<Response, 'setHeader' | 'status' | 'json'>,
  next: NextFunction,
  redis: RateLimitStore,
  windowSeconds: number,
  limit: number,
  timestamp = Date.now(),
): Promise<void> {
  const key = createRateLimitKey(request, windowSeconds, timestamp);
  let count: number;
  try {
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds + 1);
  } catch {
    response.status(503).json({
      error: 'RATE_LIMIT_UNAVAILABLE',
      message: 'Layanan sementara tidak tersedia. Silakan coba lagi.',
    });
    return;
  }

  response.setHeader('x-rate-limit-limit', String(limit));
  response.setHeader('x-rate-limit-remaining', String(Math.max(0, limit - count)));
  if (count > limit) {
    response.setHeader('retry-after', String(windowSeconds));
    response.status(429).json({ error: 'RATE_LIMITED', message: 'Terlalu banyak request. Silakan coba lagi.' });
    return;
  }
  next();
}

@Injectable()
export class RedisRateLimitMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  }).on('error', () => undefined);

  async use(request: Request, response: Response, next: NextFunction) {
    const path = request.path;
    // Liveness must remain available for orchestration during a Redis outage.
    if (shouldSkipRateLimit(path)) {
      next();
      return;
    }

    const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
    const limit = path.includes('/webhooks/')
      ? Number(process.env.RATE_LIMIT_WEBHOOK_MAX ?? 600)
      : path.includes('/admin/')
        ? Number(process.env.RATE_LIMIT_ADMIN_MAX ?? 300)
        : Number(process.env.RATE_LIMIT_PUBLIC_MAX ?? 120);
    await enforceRateLimit(request, response, next, this.redis, windowSeconds, limit);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
