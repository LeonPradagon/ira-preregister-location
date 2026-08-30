import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';

const migrationFile = resolve(import.meta.dirname, 'migrations/0000_core.sql');

const main = async () => {
  const migration = await readFile(migrationFile, 'utf8');
  for (const statement of migration.split('-- statement-breakpoint').map((item) => item.trim()).filter(Boolean)) {
    await db.execute(sql.raw(statement));
  }
  await pool.end();
};

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
