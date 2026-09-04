import { Injectable, type NestMiddleware, OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';

@Injectable()
export class RedisRateLimitMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  }).on('error', () => undefined);

  async use(request: Request, response: Response, next: NextFunction) {
    const path = request.path;
    const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
    const limit = path.includes('/webhooks/')
      ? Number(process.env.RATE_LIMIT_WEBHOOK_MAX ?? 600)
      : path.includes('/admin/')
        ? Number(process.env.RATE_LIMIT_ADMIN_MAX ?? 300)
        : Number(process.env.RATE_LIMIT_PUBLIC_MAX ?? 120);
    const tokenPart = request.params?.token || path.match(/\/public\/verifications\/([^/]+)/)?.[1] || request.headers['x-idempotency-key'] || '';
    const identity = `${request.ip}:${String(tokenPart)}`;
    const identityHash = createHash('sha256').update(identity).digest('hex');
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    const routeGroup = path.includes('/public/verifications/') ? '/public/verifications' : path.split('/').slice(0, 3).join('/');
    const routeHash = createHash('sha256').update(routeGroup).digest('hex').slice(0, 16);
    const key = `rate-limit:${bucket}:${request.method}:${routeHash}:${identityHash}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds + 1);
      response.setHeader('x-rate-limit-limit', String(limit));
      response.setHeader('x-rate-limit-remaining', String(Math.max(0, limit - count)));
      if (count > limit) {
        response.setHeader('retry-after', String(windowSeconds));
        response.status(429).json({ error: 'RATE_LIMITED', message: 'Terlalu banyak request. Silakan coba lagi.' });
        return;
      }
    } catch {
      // Availability of the API must not depend on Redis. Redis health is still
      // exposed by readiness checks and should be alerted on separately.
    }
    next();
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
