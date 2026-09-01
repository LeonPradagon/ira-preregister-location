import 'dotenv/config';
import { Pool } from 'pg';

const regionsUrl = 'https://raw.githubusercontent.com/cahyadsn/wilayah/v2026.7/db/wilayah.sql';
const postalCodesUrl = 'https://raw.githubusercontent.com/cahyadsn/wilayah_kodepos/main/json/wilayah_kodepos.json';

const fetchText = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Gagal mengunduh ${url}: HTTP ${response.status}`);
  return response.text();
};

const insertChunks = async (client, table, columns, rows, valueFactory) => {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    const params = [];
    const values = chunk.map((row, rowIndex) => {
      const placeholders = valueFactory(row).map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')} ON CONFLICT (${columns[0]}) DO UPDATE SET ${columns.slice(1).map((column) => `${column} = EXCLUDED.${column}`).join(', ')}`, params);
    process.stdout.write(`\rMengimpor ${table}: ${Math.min(offset + chunk.length, rows.length)} / ${rows.length}`);
  }
  process.stdout.write('\n');
};

const main = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');
  const [regionsSql, postalJson] = await Promise.all([fetchText(regionsUrl), fetchText(postalCodesUrl)]);
  const regionRows = [];
  const regionPattern = /\('([^']+)',\s*'((?:''|[^'])*)'\)/g;
  for (const match of regionsSql.matchAll(regionPattern)) {
    const code = match[1];
    const separator = code.lastIndexOf('.');
    regionRows.push({ code, name: match[2].replaceAll("''", "'"), parentCode: separator === -1 ? null : code.slice(0, separator), level: code.split('.').length });
  }
  const postalMap = JSON.parse(postalJson);
  const postalRows = Object.entries(postalMap).map(([regionCode, postalCode]) => ({ regionCode, postalCode: postalCode ? String(postalCode) : null }));
  if (!regionRows.length) throw new Error('Data wilayah kosong');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS administrative_regions (code varchar(13) PRIMARY KEY NOT NULL, name varchar(100) NOT NULL, parent_code varchar(13), level integer NOT NULL)`);
    await client.query(`CREATE INDEX IF NOT EXISTS administrative_regions_parent_idx ON administrative_regions (parent_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS administrative_regions_name_idx ON administrative_regions (name)`);
    await client.query(`CREATE TABLE IF NOT EXISTS region_postal_codes (region_code varchar(13) PRIMARY KEY NOT NULL, postal_code varchar(5))`);
    await client.query('TRUNCATE TABLE region_postal_codes, administrative_regions');
    await insertChunks(client, 'administrative_regions', ['code', 'name', 'parent_code', 'level'], regionRows, (row) => [row.code, row.name, row.parentCode, row.level]);
    await insertChunks(client, 'region_postal_codes', ['region_code', 'postal_code'], postalRows, (row) => [row.regionCode, row.postalCode]);
    await client.query('COMMIT');
    console.log(`Selesai: ${regionRows.length} wilayah dan ${postalRows.length} kode pos.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
