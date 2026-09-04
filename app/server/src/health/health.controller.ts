import { Controller, Get, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { db, pool } from '../db/client.js';
import { MetricsService } from '../common/metrics.service.js';

@Controller('health')
export class HealthController implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: 1, enableOfflineQueue: false }).on('error', () => undefined);

  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async check() {
    await this.readyChecks();
    return { status: 'ok', service: 'ira-preregist-server', timestamp: new Date().toISOString() };
  }

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() { return { status: 'ok', checks: await this.readyChecks() }; }

  @Get('metrics')
  metricsSnapshot() {
    return { ...this.metrics.snapshot(), databasePool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } };
  }

  private async readyChecks() {
    await db.execute(sql`select 1`);
    await this.redis.ping();
    return { database: 'ok', redis: 'ok' };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
