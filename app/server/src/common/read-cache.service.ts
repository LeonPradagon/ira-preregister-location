import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';

export interface CachedCount {
  total: number;
  countAsOf: string;
}

@Injectable()
export class ReadCacheService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  }).on('error', () => undefined);

  private key(prefix: string, value: unknown) {
    const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
    return `read-cache:${prefix}:${digest}`;
  }

  async getOrSet<T>(prefix: string, value: unknown, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const key = this.key(prefix, value);
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached) as T;
    } catch {
      /* Redis is an optional acceleration layer. */
    }
    const result = await producer();
    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
    } catch {
      /* fall back to the database result */
    }
    return result;
  }

  async count(prefix: string, value: unknown, producer: () => Promise<number>): Promise<CachedCount> {
    return this.getOrSet<CachedCount>(
      `count:${prefix}`,
      value,
      Number(process.env.READ_COUNT_CACHE_TTL_SECONDS ?? 30),
      async () => ({
        total: await producer(),
        countAsOf: new Date().toISOString(),
      }),
    );
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
