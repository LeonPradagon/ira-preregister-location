import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db, pool } from '../dist/db/client.js';
import { ticketingMitra, ticketingMitraAreas } from '../dist/db/schema/index.js';

const seedPath = resolve(import.meta.dirname, '../seed-data/ticketingMitra.data.json');
const areasPath = resolve(import.meta.dirname, '../seed-data/ticketingMitraAreas.data.json');

const main = async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
    throw new Error('Ticketing mitra seed hanya diizinkan untuk database lokal.');
  }

  const entries = JSON.parse(await readFile(seedPath, 'utf8'));
  const areaEntries = JSON.parse(await readFile(areasPath, 'utf8'));
  if (
    !Array.isArray(entries) ||
    entries.some(
      (entry) =>
        typeof entry.id !== 'string' ||
        (entry.code !== null && typeof entry.code !== 'string') ||
        typeof entry.name !== 'string' ||
        typeof entry.isActive !== 'boolean' ||
        !Array.isArray(entry.locations) ||
        entry.locations.some((location) => typeof location !== 'string'),
    )
  ) {
    throw new Error('Format data seed ticketing mitra tidak valid.');
  }
  if (
    !Array.isArray(areaEntries) ||
    areaEntries.some(
      (area) =>
        typeof area.siteId !== 'string' ||
        typeof area.mitraId !== 'string' ||
        typeof area.siteName !== 'string' ||
        (area.locationName !== null && typeof area.locationName !== 'string') ||
        typeof area.polygon !== 'string' ||
        !area.polygon.trim(),
    )
  ) {
    throw new Error('Format polygon seed ticketing mitra tidak valid.');
  }

  await db.transaction(async (transaction) => {
    await transaction.delete(ticketingMitraAreas);
    await transaction.delete(ticketingMitra);
    if (entries.length) {
      await transaction.insert(ticketingMitra).values(
        entries.map((entry) => ({
          sourceId: entry.id,
          mitraCode: entry.code,
          mitraName: entry.name,
          locations: entry.locations,
          isActive: entry.isActive,
          updatedAt: new Date(),
        })),
      );
    }
    if (areaEntries.length) {
      await transaction.insert(ticketingMitraAreas).values(
        areaEntries.map((area) => ({
          sourceSiteId: area.siteId,
          mitraSourceId: area.mitraId,
          siteName: area.siteName,
          locationName: area.locationName,
          boundary: area.polygon,
        })),
      );
    }
  });
  console.log(
    `Loaded ${entries.length} ticketing mitra (${entries.filter((entry) => entry.isActive).length} active) and ${areaEntries.length} active site polygons into local database.`,
  );
};

try {
  await main();
} finally {
  await pool.end();
}
