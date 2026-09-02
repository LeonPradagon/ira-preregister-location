import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';

const migrationsDir = resolve(import.meta.dirname, 'migrations');
const migrationName = /^\d{4}_.+\.sql$/;

const main = async () => {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => migrationName.test(fileName))
    // 0000_ambiguous_kree.sql is a local Drizzle-generated artifact. The
    // application baseline is 0000_core.sql; future app migrations use 0001+.
    .filter((fileName) => fileName === '0000_core.sql' || !fileName.startsWith('0000_'))
    .sort();

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "app_migrations" (
      "filename" varchar(255) PRIMARY KEY NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )
  `));

  const appliedRows = await db.execute(sql.raw('SELECT "filename" FROM "app_migrations"'));
  const applied = new Set(appliedRows.rows.map((row) => String(row.filename)));

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) continue;
    const migration = await readFile(resolve(migrationsDir, fileName), 'utf8');
    await db.transaction(async (transaction) => {
      for (const statement of migration.split('-- statement-breakpoint').map((item) => item.trim()).filter(Boolean)) {
        await transaction.execute(sql.raw(statement));
      }
      await transaction.execute(sql`INSERT INTO "app_migrations" ("filename") VALUES (${fileName})`);
    });
    console.log(`Applied migration ${fileName}`);
  }
  await pool.end();
};

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
