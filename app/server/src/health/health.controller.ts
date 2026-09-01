import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    await db.execute(sql`select 1`);
    return { status: 'ok', service: 'ira-preregist-server', timestamp: new Date().toISOString() };
  }
}
