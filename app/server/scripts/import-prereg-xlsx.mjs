import 'dotenv/config';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import pg from 'pg';

const { Pool } = pg;
const sourcePath = process.argv[2] ? resolve(process.argv[2]) : null;
const batchSize = Number(process.env.IMPORT_BATCH_SIZE ?? 500);
const requiredHeaders = [
  'id', 'full_name', 'effective_phone_number', 'effective_address', 'address_reference',
  'effective_longitude', 'effective_latitude', 'effective_province', 'effective_kota',
  'effective_kecamatan', 'effective_kelurahan', 'created_at', 'is_cover_bts', 'bts_name', 'coverage_status',
];

if (!sourcePath || !existsSync(sourcePath)) throw new Error('Usage: npm run import:prereg -- /absolute/path/to/file.xlsx-or-file.csv');
if (!Number.isInteger(batchSize) || batchSize < 100 || batchSize > 5000) throw new Error('IMPORT_BATCH_SIZE must be between 100 and 5000');
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
  const number = Number(text(value));
  if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}: ${label} is not numeric`);
  if (label === 'longitude' && (number < -180 || number > 180)) throw new Error(`Row ${rowNumber}: longitude is out of range`);
  if (label === 'latitude' && (number < -90 || number > 90)) throw new Error(`Row ${rowNumber}: latitude is out of range`);
  return number;
};

const postalCodeFromAddress = (address) => address.match(/\b(\d{5})\b/)?.[1] ?? '00000';

const streetFromAddress = (address) => {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return (parts.find((part) => /^(jl\.?|jalan|jln\.?|gg\.?|gang|komplek|komp\.?|kampung|kp\.?|dusun|desa)\b/i.test(part)) ?? parts[0] ?? 'UNKNOWN').slice(0, 255);
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

const parseRows = (matrix) => {
  const headers = (matrix[0] ?? []).map((value) => text(value).replace(/^\uFEFF/, ''));
  if (requiredHeaders.some((header, index) => headers[index] !== header)) {
    throw new Error(`Unexpected headers. Expected: ${requiredHeaders.join(', ')}`);
  }

  const rows = [];
  const seenIds = new Set();
  const seenPhones = new Set();
  const stats = { rows: 0, duplicatePhones: 0, missingPostalCodes: 0, coverage: new Map(), coveredBts: 0 };
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const sourceValues = matrix[rowIndex] ?? [];
    const values = Object.fromEntries(requiredHeaders.map((header, index) => [header, text(sourceValues[index])]));
    if (!values.id || !values.full_name || !values.effective_address || !values.effective_province || !values.effective_kota || !values.effective_kecamatan || !values.effective_kelurahan) {
      throw new Error(`Row ${rowNumber}: required identity/address field is empty`);
    }
    if (seenIds.has(values.id)) throw new Error(`Row ${rowNumber}: duplicate source id ${values.id}`);
    seenIds.add(values.id);
    const phoneE164 = normalizePhone(values.effective_phone_number);
    if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) throw new Error(`Row ${rowNumber}: invalid phone ${values.effective_phone_number}`);
    if (seenPhones.has(phoneE164)) stats.duplicatePhones += 1;
    seenPhones.add(phoneE164);
    const longitude = parseCoordinate(values.effective_longitude, 'longitude', rowNumber);
    const latitude = parseCoordinate(values.effective_latitude, 'latitude', rowNumber);
    const postalCode = postalCodeFromAddress(values.effective_address);
    if (postalCode === '00000') stats.missingPostalCodes += 1;
    const coverageStatus = values.coverage_status || 'UNKNOWN';
    stats.coverage.set(coverageStatus, (stats.coverage.get(coverageStatus) ?? 0) + 1);
    if (parseBoolean(values.is_cover_bts)) stats.coveredBts += 1;
    const sourceCreatedAt = values.created_at ? new Date(values.created_at) : null;
    if (sourceCreatedAt && Number.isNaN(sourceCreatedAt.getTime())) throw new Error(`Row ${rowNumber}: invalid created_at`);
    rows.push({
      sourceId: values.id,
      externalId: `PREREG-NON-CUSTOMER-${values.id}`,
      fullName: values.full_name,
      phoneE164,
      rawAddress: values.effective_address,
      landmark: values.address_reference || null,
      longitude,
      latitude,
      province: values.effective_province,
      city: values.effective_kota,
      district: values.effective_kecamatan,
      subdistrict: values.effective_kelurahan,
      postalCode,
      street: streetFromAddress(values.effective_address),
      houseNumber: houseNumberFromAddress(values.effective_address),
      sourceCreatedAt,
      coverageStatus,
      isCoverBts: parseBoolean(values.is_cover_bts),
      btsName: values.bts_name || null,
    });
    stats.rows += 1;
  }
  return { rows, stats };
};

const readRows = async () => {
  if (sourcePath.toLowerCase().endsWith('.csv')) {
    return parseRows(parseCsv(await readFile(sourcePath, 'utf8')));
  }

  let workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(sourcePath);
  } catch (error) {
    try {
      const repairedBuffer = await repairWorkbookXml(await readFile(sourcePath));
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(repairedBuffer);
    } catch {
      throw error;
    }
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Workbook has no worksheet');
  const matrix = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    matrix.push(worksheet.getRow(rowNumber).values.slice(1));
  }
  return parseRows(matrix);
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
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
      longitude numeric(10,7) NOT NULL,
      latitude numeric(10,7) NOT NULL,
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
    for (let index = 0; index < rows.length; index += batchSize) await insertStageBatch(client, rows.slice(index, index + batchSize));

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
          reference_location = ST_SetSRID(ST_MakePoint(stage.longitude, stage.latitude), 4326)::geography,
          reference_source = 'PREREG_IMPORT',
          reference_precision = 'STREET',
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
        ST_SetSRID(ST_MakePoint(stage.longitude, stage.latitude), 4326)::geography,
        'PREREG_IMPORT', 'STREET', 0.000, true, false, COALESCE(stage.source_created_at, $1), COALESCE(stage.source_created_at, $1), $1
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
  coveredBtsRows: stats.coveredBts,
  coverageStatusCounts: Object.fromEntries(stats.coverage),
  whatsappOptIn: 'not set; explicit opt-in import is required before campaign blast',
  referencePrecision: 'STREET',
  importedAt: result.importedAt.toISOString(),
}, null, 2));
