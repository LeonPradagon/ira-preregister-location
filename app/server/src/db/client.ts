import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5000),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000),
  statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 10000),
  query_timeout: Number(process.env.DATABASE_QUERY_TIMEOUT_MS ?? 15000),
  ssl:
    process.env.DATABASE_SSL === 'true' ||
    (process.env.DATABASE_SSL !== 'false' && process.env.NODE_ENV === 'production')
      ? { rejectUnauthorized: true }
      : undefined,
});

export const db = drizzle(pool, { schema });
