import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { db } from '../../db/client.js';
import { auditLogs } from '../../db/schema/index.js';
import { RequestAdmin } from '../../common/request-user.js';

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.csv']);

export interface UploadedCustomerFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

interface ImportScriptResult {
  source: string;
  rowsRead: number;
  customersUpserted: number;
  addressesUpdated: number;
  addressesInserted: number;
  duplicatePhoneRows: number;
  missingPostalCodeRowsStoredAs00000: number;
  coveredBtsRows: number;
  coverageStatusCounts: Record<string, number>;
  whatsappOptIn: string;
  referencePrecision: string;
  importedAt: string;
}

@Injectable()
export class CustomerImportService {
  async import(admin: RequestAdmin, file: UploadedCustomerFile) {
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new BadRequestException('File harus berformat .xlsx atau .csv.');
    if (!file.size || !file.buffer?.length) throw new BadRequestException('File upload kosong.');
    if (file.size > MAX_UPLOAD_SIZE_BYTES) throw new BadRequestException('Ukuran file maksimal 50 MB. Gunakan beberapa file batch jika data lebih besar.');

    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'exact-location-customer-import-'));
    const temporaryPath = join(temporaryDirectory, `customers${extension}`);
    const scriptPath = resolve(import.meta.dirname, '../../../scripts/import-prereg-xlsx.mjs');
    try {
      await writeFile(temporaryPath, file.buffer);
      const { stdout } = await execFileAsync(process.execPath, [scriptPath, temporaryPath], {
        cwd: resolve(import.meta.dirname, '../../..'),
        env: process.env,
        maxBuffer: 2 * 1024 * 1024,
      });
      const result = JSON.parse(stdout.trim()) as ImportScriptResult;
      await db.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_IMPORT_COMPLETED',
        entityType: 'CUSTOMER',
        entityId: 'bulk-import',
        after: {
          fileName: file.originalname,
          rowsRead: result.rowsRead,
          customersUpserted: result.customersUpserted,
          addressesInserted: result.addressesInserted,
          addressesUpdated: result.addressesUpdated,
        },
        timestamp: new Date(),
      });
      const { source: _source, ...safeResult } = result;
      return { fileName: file.originalname, ...safeResult };
    } catch (error) {
      const childError = error as { stderr?: string; message?: string };
      const message = childError.stderr?.trim() || childError.message || 'File gagal diproses.';
      throw new BadRequestException(message.replace(/\s+/g, ' ').slice(0, 500));
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
