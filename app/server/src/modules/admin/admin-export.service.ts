import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Injectable } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, desc, eq, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, customerAddresses, customers } from '../../db/schema/index.js';
import type { CustomerExportQueryInput } from '../../common/contracts.js';
import type { RequestAdmin } from '../../common/request-user.js';
import { campaignEligibleAddressSql, incompleteAddressSql } from '../validation/address-completeness.sql.js';
import { campaignRecipientReservationStatuses } from '../campaigns/campaign-target.policy.js';

export const EXPORT_MAX_DATA_ROWS = 50_000;

export const EXPORT_HEADERS = [
  'id',
  'full_name',
  'effective_phone_number',
  'effective_address',
  'address_reference',
  'effective_longitude',
  'effective_latitude',
  'effective_province',
  'effective_kota',
  'effective_kecamatan',
  'effective_kelurahan',
  'created_at',
  'is_cover_bts',
  'bts_name',
  'coverage_status',
] as const;

const COLUMN_WIDTHS = [14.71, 24.71, 20.71, 48.71, 34.71, 16.71, 16.71, 20.71, 22.71, 22.71, 22.71, 23.71, 14.71, 26.71, 22.71];
const TEXT_COLUMNS = new Set([1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 14, 15]);

type ExportValue = string | number | boolean | null;
type ExportRow = ExportValue[];
type CustomerRow = typeof customers.$inferSelect;
type AddressRow = typeof customerAddresses.$inferSelect;
type ExportAddress = {
  address: AddressRow | null;
  referenceLatitude: number | null;
  referenceLongitude: number | null;
};

export type CustomerExportResult = {
  body?: Buffer;
  stream?: NodeJS.ReadableStream;
  contentType: string;
  fileName: string;
  cleanup?: () => Promise<void>;
};

const contentTypes = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
} as const;

function formatDate(value: Date | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}+07:00`;
}

function sourceId(customer: CustomerRow): string {
  return customer.sourceRecordId || customer.externalId;
}

function coordinateValue(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function rowFor(customer: CustomerRow, address: ExportAddress): ExportRow {
  const latitude = coordinateValue(address.referenceLatitude);
  const longitude = coordinateValue(address.referenceLongitude);
  const activeAddress = address.address;
  return [
    sourceId(customer),
    customer.name,
    customer.phoneE164.replace(/^\+/, ''),
    activeAddress?.rawAddress || '',
    activeAddress?.addressReference || activeAddress?.landmark || '',
    longitude,
    latitude,
    activeAddress?.province || '',
    activeAddress?.city || '',
    activeAddress?.district || '',
    activeAddress?.subdistrict || '',
    formatDate(customer.sourceCreatedAt || customer.createdAt),
    Boolean(customer.isCoverBts),
    customer.btsName || '',
    customer.coverageStatus || '',
  ];
}

function buildCustomerFilters(query: CustomerExportQueryInput): SQL[] {
  const filters: SQL[] = [];
  if (query.search) {
    const pattern = `%${query.search}%`;
    filters.push(
      or(
        ilike(customers.name, pattern),
        ilike(customers.externalId, pattern),
        ilike(customers.phoneE164, pattern),
        ilike(customers.sourceRecordId, pattern),
      )!,
    );
  }
  if (query.status) filters.push(eq(customers.status, query.status));
  if (query.locationStatus === 'UNVERIFIED') {
    filters.push(
      ne(customers.status, 'SUSPENDED'),
      isNull(customers.whatsappOptOutAt),
      sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = false)`,
    );
  } else if (query.locationStatus === 'VERIFIED') {
    filters.push(
      sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = true)`,
    );
  }
  if (query.coordinateAuditStatus) {
    filters.push(sql`exists (
      select 1
      from customer_addresses coordinate_audit_address
      where coordinate_audit_address.customer_id = ${customers.id}
        and coordinate_audit_address.is_active = true
        and coordinate_audit_address.reference_source = 'PREREG_IMPORT'
        and coordinate_audit_address.coordinate_audit_status = ${query.coordinateAuditStatus}
    )`);
  }
  if (query.addressCompleteness === 'INCOMPLETE') {
    filters.push(sql`(
      not exists (
        select 1 from customer_addresses address_status
        where address_status.customer_id = ${customers.id} and address_status.is_active = true
      ) or exists (
        select 1 from customer_addresses campaign_address
        where campaign_address.customer_id = ${customers.id}
          and campaign_address.is_active = true
          and ${incompleteAddressSql('campaign_address')}
      )
    )`);
  } else if (query.addressCompleteness === 'COMPLETE') {
    filters.push(sql`exists (
      select 1 from customer_addresses campaign_address
      where campaign_address.customer_id = ${customers.id}
        and campaign_address.is_active = true
        and not ${incompleteAddressSql('campaign_address')}
    )`);
  }
  if (query.campaignAvailable) {
    const statuses = sql.join(campaignRecipientReservationStatuses.map((status) => sql`${status}`), sql`, `);
    filters.push(
      sql`exists (
        select 1 from customer_addresses campaign_address
        where campaign_address.customer_id = ${customers.id}
          and campaign_address.is_verified = false
          and ${campaignEligibleAddressSql('campaign_address')}
      ) and not exists (
        select 1 from "verification_campaign_items" reserved_item
        where reserved_item."customer_id" = ${customers.id}
          and reserved_item."status" in (${statuses})
      ) and not exists (
        select 1 from "verification_campaigns" reserved_campaign
        where reserved_campaign."status" in ('DRAFT', 'RUNNING')
          and reserved_campaign."target_filter" -> 'customerIds' ? (${customers.id})::text
      )`,
    );
  }
  return filters;
}

function cursorForCustomer(cursor: { updatedAt: Date; id: string } | null): SQL | undefined {
  return cursor
    ? or(
        lt(customers.updatedAt, cursor.updatedAt),
        and(eq(customers.updatedAt, cursor.updatedAt), lt(customers.id, cursor.id)),
      )
    : undefined;
}

function cursorForAddress(cursor: { updatedAt: Date; id: string } | null): SQL | undefined {
  return cursor
    ? or(
        lt(customerAddresses.updatedAt, cursor.updatedAt),
        and(eq(customerAddresses.updatedAt, cursor.updatedAt), lt(customerAddresses.id, cursor.id)),
      )
    : undefined;
}

@Injectable()
export class AdminExportService {
  async export(admin: RequestAdmin, query: CustomerExportQueryInput): Promise<CustomerExportResult> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ira-preregist-export-'));
    const files: Array<{ name: string; path: string }> = [];
    const cleanup = () => rm(temporaryDirectory, { recursive: true, force: true });
    let totalRows = 0;
    try {
      let part = 1;
      let cursor: { updatedAt: Date; id: string } | null = null;

      while (true) {
        const result: { rows: ExportRow[]; cursor: { updatedAt: Date; id: string } | null } =
          query.resource === 'addresses'
            ? await this.fetchAddressRows(query, cursor)
            : await this.fetchCustomerRows(query, cursor);
        if (!result.rows.length) break;
        totalRows += result.rows.length;

        const suffix = String(part).padStart(3, '0');
        const extension = query.format;
        const name = `ira_${query.resource}_part_${suffix}.${extension}`;
        const body =
          query.format === 'xlsx' ? await this.createXlsx(result.rows) : this.createCsv(result.rows);
        const path = join(temporaryDirectory, name);
        await writeFile(path, body);
        files.push({ name, path });
        cursor = result.cursor;
        part += 1;
        if (result.rows.length < EXPORT_MAX_DATA_ROWS) break;
      }

      if (!files.length) {
        const name = `ira_${query.resource}_part_001.${query.format}`;
        const body = query.format === 'xlsx' ? await this.createXlsx([]) : this.createCsv([]);
        const path = join(temporaryDirectory, name);
        await writeFile(path, body);
        files.push({ name, path });
      }

      const fileName =
        files.length === 1
          ? files[0].name
          : `ira_${query.resource}_export.zip`;
      await db.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_EXPORT_COMPLETED',
        entityType: 'CUSTOMER_EXPORT',
        entityId: `${query.resource}:${query.format}:${Date.now()}`,
        after: {
          resource: query.resource,
          format: query.format,
          fileName,
          rows: totalRows,
          parts: files.length,
          split: files.length > 1,
          filters: {
            search: query.search || null,
            status: query.status || null,
            locationStatus: query.locationStatus || null,
            coordinateAuditStatus: query.coordinateAuditStatus || null,
            addressCompleteness: query.addressCompleteness || null,
          },
        },
        reason: 'Admin mengekspor data customer dan alamat dari menu Customer & Addresses.',
        timestamp: new Date(),
      });

      if (files.length === 1) {
        const body = await readFile(files[0].path);
        await cleanup();
        return { body, contentType: contentTypes[query.format], fileName: files[0].name };
      }

      const zip = new JSZip();
      for (const file of files) zip.file(file.name, createReadStream(file.path));
      return {
        stream: zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true }),
        contentType: contentTypes.zip,
        fileName: `ira_${query.resource}_export.zip`,
        cleanup,
      };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  private async fetchCustomerRows(
    query: CustomerExportQueryInput,
    cursor: { updatedAt: Date; id: string } | null,
  ): Promise<{ rows: ExportRow[]; cursor: { updatedAt: Date; id: string } | null }> {
    const filters = buildCustomerFilters(query);
    const customerRows = await db
      .select()
      .from(customers)
      .where(and(...filters, cursorForCustomer(cursor)))
      .orderBy(desc(customers.updatedAt), desc(customers.id))
      .limit(EXPORT_MAX_DATA_ROWS);
    if (!customerRows.length) return { rows: [], cursor: null };

    const addressRows = await db
      .select({
        address: customerAddresses,
        referenceLatitude: sql<number | null>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number | null>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(customerAddresses)
      .where(and(inArray(customerAddresses.customerId, customerRows.map((customer) => customer.id)), eq(customerAddresses.isActive, true)))
      .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt));
    const addressByCustomer = new Map<string, ExportAddress>();
    for (const row of addressRows) {
      if (!addressByCustomer.has(row.address.customerId))
        addressByCustomer.set(row.address.customerId, {
          address: row.address,
          referenceLatitude: row.referenceLatitude == null ? null : Number(row.referenceLatitude),
          referenceLongitude: row.referenceLongitude == null ? null : Number(row.referenceLongitude),
        });
    }
    return {
      rows: customerRows.map((customer) =>
        rowFor(customer, addressByCustomer.get(customer.id) ?? { address: null, referenceLatitude: null, referenceLongitude: null }),
      ),
      cursor: {
        updatedAt: customerRows[customerRows.length - 1].updatedAt,
        id: customerRows[customerRows.length - 1].id,
      },
    };
  }

  private async fetchAddressRows(
    query: CustomerExportQueryInput,
    cursor: { updatedAt: Date; id: string } | null,
  ): Promise<{ rows: ExportRow[]; cursor: { updatedAt: Date; id: string } | null }> {
    const rows = await db
      .select({
        customer: customers,
        address: customerAddresses,
        referenceLatitude: sql<number | null>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number | null>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(customerAddresses)
      .innerJoin(customers, eq(customerAddresses.customerId, customers.id))
      .where(
        and(
          ...buildCustomerFilters(query),
          eq(customerAddresses.isActive, true),
          cursorForAddress(cursor),
        ),
      )
      .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.id))
      .limit(EXPORT_MAX_DATA_ROWS);
    if (!rows.length) return { rows: [], cursor: null };
    return {
      rows: rows.map((row) =>
        rowFor(row.customer, {
          address: row.address,
          referenceLatitude: row.referenceLatitude == null ? null : Number(row.referenceLatitude),
          referenceLongitude: row.referenceLongitude == null ? null : Number(row.referenceLongitude),
        }),
      ),
      cursor: {
        updatedAt: rows[rows.length - 1].address.updatedAt,
        id: rows[rows.length - 1].address.id,
      },
    };
  }

  private createCsv(rows: ExportRow[]): Buffer {
    const csvCell = (value: ExportValue, column: number): string => {
      if (value == null) return '';
      if (typeof value === 'boolean') return value ? '1' : '0';
      if (column === 6 || column === 7) return typeof value === 'number' ? value.toFixed(7) : String(value);
      return String(value);
    };
    const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    const lines = [EXPORT_HEADERS.join(',')];
    for (const row of rows) lines.push(row.map((value, index) => escape(csvCell(value, index + 1))).join(','));
    return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
  }

  private async createXlsx(rows: ExportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IRA Preregist';
    const worksheet = workbook.addWorksheet('Prereg Non Customer', { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.columns = EXPORT_HEADERS.map((header, index) => ({ header, key: `column${index + 1}`, width: COLUMN_WIDTHS[index] }));
    worksheet.addRows(rows);
    const header = worksheet.getRow(1);
    header.height = 32;
    header.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cell.alignment = { vertical: 'top', horizontal: columnNumber === 13 ? 'center' : undefined };
        if (TEXT_COLUMNS.has(columnNumber)) cell.numFmt = '@';
        if (columnNumber === 6 || columnNumber === 7) cell.numFmt = '0.0000000';
      });
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
