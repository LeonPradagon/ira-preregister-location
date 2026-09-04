import 'dotenv/config';
import { existsSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import pg from 'pg';

const { Pool } = pg;
const sourcePath = process.argv[2] ? resolve(process.argv[2]) : null;
const batchSize = Number(process.env.IMPORT_BATCH_SIZE ?? 500);
const headerAliases = {
  id: ['id', 'source_id', 'customer_id', 'customer_code'],
  full_name: ['full_name', 'fullname', 'name', 'nama', 'nama_lengkap'],
  effective_phone_number: ['effective_phone_number', 'phone', 'phone_number', 'phone_e164', 'nomor_hp', 'no_hp', 'whatsapp'],
  effective_address: ['effective_address', 'address', 'alamat', 'alamat_lengkap'],
  address_reference: ['address_reference', 'landmark', 'patokan', 'address_detail'],
  effective_longitude: ['effective_longitude', 'longitude', 'lon', 'lng', 'koordinat_longitude'],
  effective_latitude: ['effective_latitude', 'latitude', 'lat', 'koordinat_latitude'],
  effective_province: ['effective_province', 'province', 'provinsi'],
  effective_kota: ['effective_kota', 'city', 'regency', 'kota', 'kabupaten', 'kota_kabupaten'],
  effective_kecamatan: ['effective_kecamatan', 'district', 'kecamatan'],
  effective_kelurahan: ['effective_kelurahan', 'subdistrict', 'village', 'kelurahan', 'desa'],
  created_at: ['created_at', 'created', 'tanggal_dibuat'],
  is_cover_bts: ['is_cover_bts', 'cover_bts', 'covered_bts'],
  bts_name: ['bts_name', 'bts', 'nama_bts'],
  coverage_status: ['coverage_status', 'coverage', 'status_coverage'],
};

const requiredHeaders = ['id', 'full_name', 'effective_phone_number'];
const canonicalHeader = (value) => text(value).replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const buildHeaderMap = (headers, rowNumber = 1) => {
  const indexes = new Map(headers.map((header, index) => [canonicalHeader(header), index]));
  const resolved = {};
  for (const [field, aliases] of Object.entries(headerAliases)) {
    const index = aliases.map(canonicalHeader).map((alias) => indexes.get(alias)).find((candidate) => candidate !== undefined);
    if (index !== undefined) resolved[field] = index;
  }
  const missing = requiredHeaders.filter((field) => resolved[field] === undefined);
  if (missing.length) throw new Error(`Row ${rowNumber}: header wajib tidak ditemukan: ${missing.join(', ')}`);
  return resolved;
};

if (!sourcePath || !existsSync(sourcePath)) throw new Error('Usage: npm run import:prereg -- /absolute/path/to/file.xlsx-or-file.csv');
if (!Number.isInteger(batchSize) || batchSize < 100 || batchSize > 1000) throw new Error('IMPORT_BATCH_SIZE must be between 100 and 1000');
if (!['.xlsx', '.csv'].includes(sourcePath.slice(sourcePath.lastIndexOf('.')).toLowerCase())) throw new Error('Only .xlsx and .csv files are supported');

const text = (value) => {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '');
    if ('richText' in value) return value.richText.map((part) => part.text ?? '').join('');
    if ('result' in value) return String(value.result ?? '');
  }
  return String(value).trim();
};

const normalizePhone = (value) => {
  const raw = text(value).trim();
  const digits = raw.replace(/\D/g, '');
  let normalized;
  if (raw.startsWith('+')) normalized = `+${digits}`;
  else if (digits.startsWith('00')) normalized = `+${digits.slice(2)}`;
  else if (digits.startsWith('62')) normalized = `+${digits}`;
  else if (digits.startsWith('0')) normalized = `+62${digits.slice(1)}`;
  else normalized = `+${digits}`;
  return normalized;
};

const parseCoordinate = (value, label, rowNumber) => {
  if (!text(value)) return null;
  const number = Number(text(value));
  if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}: ${label} is not numeric`);
  if (label === 'longitude' && (number < -180 || number > 180)) throw new Error(`Row ${rowNumber}: longitude is out of range`);
  if (label === 'latitude' && (number < -90 || number > 90)) throw new Error(`Row ${rowNumber}: latitude is out of range`);
  return number;
};

const postalCodeFromAddress = (address) => address.match(/\b(\d{5})\b/)?.[1] ?? '00000';

// Plus Codes in the source export are sometimes concatenated with the next
// address token (for example `M8VF+Q5FBulurejo`). Keep the raw address, but
// recognize and remove the code when deriving structured street data.
const plusCodePattern = /[23456789cfghjmpqrvwx]{4,8}\+(?:[23456789cfghjmpqrvwx]{3}\d|[23456789cfghjmpqrvwx]{4})(?=$|[\s,])|[23456789cfghjmpqrvwx]{4,8}\+[23456789cfghjmpqrvwx]{2,3}/i;
const isPlusCode = (value) => Boolean(value?.trim() && plusCodePattern.test(value));
const removePlusCode = (value) => value.replace(plusCodePattern, ' ').replace(/\s+/g, ' ').trim();

const isAdministrativePart = (value) => /^(rt\.?|rw\.?|kec\.?|kecamatan|kel\.?|kelurahan|desa|kab\.?|kabupaten|kota|jawa|indonesia)\b/i.test(value.trim());
const isStreetPrefixOnly = (value) => /^(jl\.?|jalan|jln\.?|gg\.?|gang|komplek|komp\.?)$/i.test(value.trim());

const streetFromAddress = (address) => {
  const parts = address.split(',').map((part) => removePlusCode(part)).filter(Boolean);
  return (parts.find((part) => !isPlusCode(part) && !isStreetPrefixOnly(part) && /^(jl\.?|jalan|jln\.?|gg\.?|gang|komplek|komp\.?|kampung|kp\.?|dusun)\b/i.test(part))
    ?? parts.find((part) => !isPlusCode(part) && !isStreetPrefixOnly(part) && !isAdministrativePart(part) && !/^rt\.?\s*\d|^rw\.?\s*\d/i.test(part))
    ?? 'UNKNOWN').slice(0, 255);
};

const houseNumberFromAddress = (address) => address.match(/\b(?:no|nomor)\.?\s*([0-9]+[a-z]?(?:[/-][a-z0-9]+)*)/i)?.[1] ?? 'UNKNOWN';

const parseBoolean = (value) => ['1', 'true', 'yes', 'y'].includes(text(value).toLowerCase());

const repairWorkbookXml = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith('.xml'));
  for (const name of xmlFiles) {
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async('string');
    xml = xml.replace(/^\uFEFF/, '').replace(/<(\/?)[a-zA-Z0-9_-]+:/g, '<$1').replace(/\s+xmlns:[a-zA-Z0-9_-]+="[^"]+"/g, '');
    if (name === 'xl/_rels/workbook.xml.rels') xml = xml.replace(/Target="\//g, 'Target="');
    zip.file(name, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
};

const parseCsv = (source) => {
  const input = source.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === '\n') {
      pushField();
      pushRow();
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (inQuotes) throw new Error('CSV contains an unterminated quoted field');
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
};

const createStats = () => ({ rows: 0, duplicatePhones: 0, missingPostalCodes: 0, missingCoordinates: 0, incompleteAddresses: 0, coverage: new Map(), coveredBts: 0 });

const parseDataRow = (headers, sourceValues, rowNumber, seenIds, seenPhones, stats, headerMap = buildHeaderMap(headers, rowNumber)) => {
  const valueOf = (field) => text(headerMap[field] === undefined ? '' : sourceValues[headerMap[field]]);
  const values = Object.fromEntries(Object.keys(headerAliases).map((field) => [field, valueOf(field)]));
  if (!values.id || !values.full_name || !values.effective_phone_number) throw new Error(`Row ${rowNumber}: id, full_name, dan effective_phone_number wajib diisi`);
  if (seenIds.has(values.id)) throw new Error(`Row ${rowNumber}: duplicate source id ${values.id}`);
  seenIds.add(values.id);
  const phoneE164 = normalizePhone(values.effective_phone_number);
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) throw new Error(`Row ${rowNumber}: invalid phone ${values.effective_phone_number}`);
  if (seenPhones.has(phoneE164)) stats.duplicatePhones += 1;
  seenPhones.add(phoneE164);
  const longitude = parseCoordinate(values.effective_longitude, 'longitude', rowNumber);
  const latitude = parseCoordinate(values.effective_latitude, 'latitude', rowNumber);
  if (longitude == null || latitude == null) stats.missingCoordinates += 1;
  const rawAddress = values.effective_address || 'UNKNOWN ADDRESS';
  const postalCode = postalCodeFromAddress(rawAddress);
  const street = streetFromAddress(rawAddress);
  const houseNumber = houseNumberFromAddress(rawAddress);
  if (postalCode === '00000') stats.missingPostalCodes += 1;
  if (postalCode === '00000' || street === 'UNKNOWN' || houseNumber === 'UNKNOWN' || !values.effective_province || !values.effective_kota || !values.effective_kecamatan || !values.effective_kelurahan || longitude == null || latitude == null) stats.incompleteAddresses += 1;
  const coverageStatus = values.coverage_status || 'UNKNOWN';
  stats.coverage.set(coverageStatus, (stats.coverage.get(coverageStatus) ?? 0) + 1);
  if (parseBoolean(values.is_cover_bts)) stats.coveredBts += 1;
  const sourceCreatedAt = values.created_at ? new Date(values.created_at) : null;
  if (sourceCreatedAt && Number.isNaN(sourceCreatedAt.getTime())) throw new Error(`Row ${rowNumber}: invalid created_at`);
  stats.rows += 1;
  return { sourceId: values.id, externalId: `PREREG-NON-CUSTOMER-${values.id}`, fullName: values.full_name, phoneE164, rawAddress, landmark: values.address_reference || null, longitude, latitude, province: values.effective_province || 'UNKNOWN', city: values.effective_kota || 'UNKNOWN', district: values.effective_kecamatan || 'UNKNOWN', subdistrict: values.effective_kelurahan || 'UNKNOWN', postalCode, street, houseNumber, sourceCreatedAt, coverageStatus, isCoverBts: parseBoolean(values.is_cover_bts), btsName: values.bts_name || null };
};

const parseCsvLine = (line, delimiter) => {
  const values = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === delimiter) { values.push(field); field = ''; }
    else field += character;
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  values.push(field);
  return values;
};

const streamCsvRows = async function* (stats) {
  const input = createReadStream(sourcePath, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let delimiter = ',';
  const seenIds = new Set();
  const seenPhones = new Set();
  let rowNumber = 0;
  try {
    for await (const rawLine of lines) {
      rowNumber += 1;
      if (!rawLine.trim()) continue;
      if (!headers) { delimiter = rawLine.includes(';') && !rawLine.includes(',') ? ';' : ','; headers = parseCsvLine(rawLine.replace(/^\uFEFF/, ''), delimiter).map((value) => text(value)); continue; }
      yield parseDataRow(headers, parseCsvLine(rawLine, delimiter), rowNumber, seenIds, seenPhones, stats);
    }
  } finally { lines.close(); input.destroy(); }
};

const streamXlsxRows = async function* (stats) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(sourcePath, { worksheets: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore' });
  const seenIds = new Set();
  const seenPhones = new Set();
  for await (const worksheet of workbook) {
    let headers = null;
    for await (const row of worksheet) {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const rowNumber = row.number;
      if (!headers) { headers = values.map((value) => text(value).replace(/^\uFEFF/, '')); continue; }
      if (values.every((value) => text(value) === '')) continue;
      yield parseDataRow(headers, values, rowNumber, seenIds, seenPhones, stats);
    }
    break;
  }
};

const parseRows = (matrix) => {
  const stats = createStats();
  const headers = (matrix[0] ?? []).map((value) => text(value).replace(/^\uFEFF/, ''));
  const seenIds = new Set();
  const seenPhones = new Set();
  const rows = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) rows.push(parseDataRow(headers, matrix[rowIndex] ?? [], rowIndex + 1, seenIds, seenPhones, stats));
  return { rows, stats };
};

const readRepairedXlsxRows = async function* (stats, originalError) {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await repairWorkbookXml(await readFile(sourcePath))); }
  catch (error) { throw originalError ?? error; }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Workbook has no worksheet');
  const matrix = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) matrix.push(worksheet.getRow(rowNumber).values.slice(1));
  const repaired = parseRows(matrix);
  Object.assign(stats, repaired.stats);
  yield* repaired.rows;
};

const streamXlsxRowsWithFallback = async function* (stats) {
  let yieldedRows = false;
  try {
    for await (const row of streamXlsxRows(stats)) {
      yieldedRows = true;
      yield row;
    }
  } catch (error) {
    // Some Excel exports contain malformed namespace XML. ExcelJS's streaming
    // reader may throw lazily, so only retry before yielding data to avoid a
    // partial import being duplicated.
    if (yieldedRows) throw error;
    yield* readRepairedXlsxRows(stats, error);
    return;
  }
  // A prefixed namespace workbook can also fail silently and emit zero rows.
  // Treat that result as unreadable and use the same XML repair path.
  if (!yieldedRows) yield* readRepairedXlsxRows(stats);
};

const readRows = async () => {
  const stats = createStats();
  if (sourcePath.toLowerCase().endsWith('.csv')) return { rows: streamCsvRows(stats), stats };
  return { rows: streamXlsxRowsWithFallback(stats), stats };
};

const stageColumns = ['source_id', 'external_id', 'full_name', 'phone_e164', 'raw_address', 'landmark', 'longitude', 'latitude', 'province', 'city', 'district', 'subdistrict', 'postal_code', 'street', 'house_number', 'source_created_at', 'coverage_status', 'is_cover_bts', 'bts_name'];

const insertStageBatch = async (client, rows) => {
  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * stageColumns.length;
    values.push(row.sourceId, row.externalId, row.fullName, row.phoneE164, row.rawAddress, row.landmark, row.longitude, row.latitude, row.province, row.city, row.district, row.subdistrict, row.postalCode, row.street, row.houseNumber, row.sourceCreatedAt, row.coverageStatus, row.isCoverBts, row.btsName);
    return `(${stageColumns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
  });
  await client.query(`INSERT INTO prereg_import_stage (${stageColumns.join(', ')}) VALUES ${placeholders.join(', ')}`, values);
};

const importRows = async ({ rows, stats }) => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5000),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000),
  });
  const client = await pool.connect();
  const importedAt = new Date();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE prereg_import_stage (
      source_id text PRIMARY KEY,
      external_id varchar(128) NOT NULL,
      full_name varchar(255) NOT NULL,
      phone_e164 varchar(32) NOT NULL,
      raw_address text NOT NULL,
      landmark text,
      longitude numeric(10,7),
      latitude numeric(10,7),
      province varchar(128) NOT NULL,
      city varchar(128) NOT NULL,
      district varchar(128) NOT NULL,
      subdistrict varchar(128) NOT NULL,
      postal_code varchar(16) NOT NULL,
      street varchar(255) NOT NULL,
      house_number varchar(64) NOT NULL,
      source_created_at timestamptz,
      coverage_status text,
      is_cover_bts boolean NOT NULL,
      bts_name text
    ) ON COMMIT DROP`);
    let stageBatch = [];
    for await (const row of rows) {
      stageBatch.push(row);
      if (stageBatch.length >= batchSize) {
        await insertStageBatch(client, stageBatch);
        stageBatch = [];
      }
    }
    if (stageBatch.length) await insertStageBatch(client, stageBatch);

    const customerResult = await client.query(`
      INSERT INTO customers (external_id, name, phone_e164, status, source_record_id, source_created_at, is_cover_bts, bts_name, coverage_status, source_metadata, created_at, updated_at)
      SELECT external_id, full_name, phone_e164, 'PENDING_INSTALLATION',
        source_id, source_created_at, is_cover_bts, bts_name, coverage_status,
        jsonb_build_object('source', 'prereg_non_customer', 'sourceId', source_id, 'addressReference', landmark, 'isCoverBts', is_cover_bts, 'btsName', bts_name, 'coverageStatus', coverage_status),
        COALESCE(source_created_at, $1), $1
      FROM prereg_import_stage
      ON CONFLICT (external_id) DO UPDATE SET
        name = EXCLUDED.name,
        phone_e164 = EXCLUDED.phone_e164,
        source_record_id = EXCLUDED.source_record_id,
        source_created_at = EXCLUDED.source_created_at,
        is_cover_bts = EXCLUDED.is_cover_bts,
        bts_name = EXCLUDED.bts_name,
        coverage_status = EXCLUDED.coverage_status,
        source_metadata = EXCLUDED.source_metadata,
        status = CASE WHEN customers.status = 'VERIFIED' THEN customers.status ELSE 'PENDING_INSTALLATION' END,
        updated_at = EXCLUDED.updated_at
      RETURNING id
    `, [importedAt]);

    const addressUpdate = await client.query(`
      UPDATE customer_addresses address
      SET raw_address = stage.raw_address,
          province = stage.province,
          city = stage.city,
          district = stage.district,
          subdistrict = stage.subdistrict,
          postal_code = stage.postal_code,
          street = stage.street,
          house_number = stage.house_number,
          landmark = stage.landmark,
          address_reference = stage.landmark,
          reference_location = CASE WHEN stage.longitude IS NOT NULL AND stage.latitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint(stage.longitude, stage.latitude), 4326)::geography ELSE NULL END,
          reference_source = CASE WHEN stage.longitude IS NOT NULL AND stage.latitude IS NOT NULL THEN 'PREREG_IMPORT' ELSE 'CUSTOMER_PROPOSED' END,
          reference_precision = CASE WHEN stage.longitude IS NOT NULL AND stage.latitude IS NOT NULL THEN 'STREET' ELSE 'UNKNOWN' END,
          reference_confidence = 0.000,
          is_verified = false,
          updated_at = $1
      FROM prereg_import_stage stage
      INNER JOIN customers customer ON customer.external_id = stage.external_id
      WHERE address.customer_id = customer.id AND address.address_type = 'MASTER' AND address.is_active = true
    `, [importedAt]);

    const addressInsert = await client.query(`
      INSERT INTO customer_addresses (
        customer_id, address_type, address_status, raw_address, province, city, district, subdistrict, postal_code,
        street, house_number, landmark, address_reference, reference_location, reference_source, reference_precision, reference_confidence,
        is_active, is_verified, valid_from, created_at, updated_at
      )
      SELECT customer.id, 'MASTER', 'ACTIVE', stage.raw_address, stage.province, stage.city, stage.district, stage.subdistrict, stage.postal_code,
        stage.street, stage.house_number, stage.landmark, stage.landmark,
        CASE WHEN stage.longitude IS NOT NULL AND stage.latitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint(stage.longitude, stage.latitude), 4326)::geography ELSE NULL END,
        CASE WHEN stage.longitude IS NOT NULL AND stage.latitude IS NOT NULL THEN 'PREREG_IMPORT' ELSE 'CUSTOMER_PROPOSED' END,
        CASE WHEN stage.longitude IS NOT NULL AND stage.latitude IS NOT NULL THEN 'STREET' ELSE 'UNKNOWN' END,
        0.000, true, false, COALESCE(stage.source_created_at, $1), COALESCE(stage.source_created_at, $1), $1
      FROM prereg_import_stage stage
      INNER JOIN customers customer ON customer.external_id = stage.external_id
      WHERE NOT EXISTS (
        SELECT 1 FROM customer_addresses existing
        WHERE existing.customer_id = customer.id AND existing.address_type = 'MASTER' AND existing.is_active = true
      )
      RETURNING id
    `, [importedAt]);

    await client.query('COMMIT');
    return { customersUpserted: customerResult.rowCount ?? 0, addressesUpdated: addressUpdate.rowCount ?? 0, addressesInserted: addressInsert.rowCount ?? 0, importedAt };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

const { rows, stats } = await readRows();
const result = await importRows({ rows, stats });
console.info(JSON.stringify({
  source: sourcePath,
  rowsRead: stats.rows,
  customersUpserted: result.customersUpserted,
  addressesUpdated: result.addressesUpdated,
  addressesInserted: result.addressesInserted,
  duplicatePhoneRows: stats.duplicatePhones,
  missingPostalCodeRowsStoredAs00000: stats.missingPostalCodes,
  missingCoordinateRows: stats.missingCoordinates,
  incompleteAddressRows: stats.incompleteAddresses,
  coveredBtsRows: stats.coveredBts,
  coverageStatusCounts: Object.fromEntries(stats.coverage),
  whatsappOptIn: 'not set; explicit opt-in import is required before campaign blast',
  referencePrecision: 'STREET',
  importedAt: result.importedAt.toISOString(),
}, null, 2));
