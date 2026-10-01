import 'dotenv/config';
import pg from 'pg';
import { db, pool as localPool } from '../dist/db/client.js';
import { ticketingFwaCustomerPoints, ticketingMitra } from '../dist/db/schema/index.js';
import { eq, sql } from 'drizzle-orm';

const { Pool } = pg;
const BATCH_SIZE = 1000;

const main = async () => {
  const localUrl = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(localUrl.hostname)) {
    throw new Error('Import titik FWA hanya diizinkan ke database lokal.');
  }

  const sourceUrl = process.env.FWA_CUSTOMER_DATABASE_URL?.trim();
  if (!sourceUrl) throw new Error('FWA_CUSTOMER_DATABASE_URL belum dikonfigurasi.');
  const timeoutMs = Math.min(Number(process.env.FWA_CUSTOMER_IMPORT_TIMEOUT_MS ?? 60000), 120000);
  const sourcePool = new Pool({
    connectionString: sourceUrl,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    options: `-c default_transaction_read_only=on -c statement_timeout=${timeoutMs}`,
    application_name: 'ira-preregist-ticketing-fwa-point-import',
  });

  try {
    const localMitras = await db
      .select({ sourceId: ticketingMitra.sourceId })
      .from(ticketingMitra)
      .where(eq(ticketingMitra.isActive, true));
    const localMitraIds = new Set(localMitras.map((mitra) => mitra.sourceId));

    const sourceClient = await sourcePool.connect();
    let sourceRows;
    try {
      await sourceClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      sourceRows = await sourceClient.query(
        `SELECT c.mitra_id, c.latitude, c.longitude
         FROM surge_schema.customer c
         JOIN surge_schema.mitra m
           ON m.id = c.mitra_id
          AND m.deleted_at IS NULL
          AND m.status::text = 'active'
         WHERE c.deleted_at IS NULL
           AND c.status::text = 'active'
           AND c.latitude BETWEEN -90 AND 90
           AND c.longitude BETWEEN -180 AND 180
         ORDER BY c.id`,
      );
      await sourceClient.query('COMMIT');
    } catch (error) {
      await sourceClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      sourceClient.release();
    }

    const rows = sourceRows.rows
      .filter((row) => localMitraIds.has(row.mitra_id))
      .map((row) => ({
        mitraSourceId: row.mitra_id,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      }));
    const unmapped = sourceRows.rowCount - rows.length;

    await db.transaction(async (transaction) => {
      await transaction.execute(sql.raw('TRUNCATE TABLE "ticketing_fwa_customer_points"'));
      for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
        await transaction.insert(ticketingFwaCustomerPoints).values(rows.slice(offset, offset + BATCH_SIZE));
      }
    });

    console.log(
      `Imported ${rows.length} active FWA customer coordinate points to local DB; skipped ${unmapped} points without a matching active local mitra. Source rows were read-only.`,
    );
  } finally {
    await Promise.all([sourcePool.end(), localPool.end()]);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Import titik FWA gagal.');
  process.exitCode = 1;
});
