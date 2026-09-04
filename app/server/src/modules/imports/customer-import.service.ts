import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, importJobs } from '../../db/schema/index.js';
import { RequestAdmin } from '../../common/request-user.js';

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.csv']);

export interface UploadedCustomerFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

const importQueueName = 'exact-location-imports';
const execFileAsync = promisify(execFile);
const LEGACY_SYNC_MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface ImportScriptResult {
  source: string;
  rowsRead: number;
  customersUpserted: number;
  addressesUpdated: number;
  addressesInserted: number;
  duplicatePhoneRows: number;
  missingPostalCodeRowsStoredAs00000: number;
  missingCoordinateRows: number;
  incompleteAddressRows: number;
  coveredBtsRows: number;
  coverageStatusCounts: Record<string, number>;
  whatsappOptIn: string;
  referencePrecision: string;
  importedAt: string;
}

@Injectable()
export class CustomerImportService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }).on('error', () => undefined);
  private readonly queue = new Queue(importQueueName, { connection: this.connection });

  async importLegacy(admin: RequestAdmin, file: UploadedCustomerFile) {
    if (file.size > LEGACY_SYNC_MAX_SIZE_BYTES) return this.import(admin, file);
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new BadRequestException('File harus berformat .xlsx atau .csv.');
    if (!file.size || (!file.buffer?.length && !file.path)) throw new BadRequestException('File upload kosong.');
    let temporaryDirectory: string | null = null;
    const sourcePath = file.path || join(temporaryDirectory = await mkdtemp(join(tmpdir(), 'exact-location-customer-import-')), `customers${extension}`);
    try {
      if (!file.path) await writeFile(sourcePath, file.buffer!);
      const { stdout } = await execFileAsync(process.execPath, [resolve(import.meta.dirname, '../../../scripts/import-prereg-xlsx.mjs'), sourcePath], { cwd: resolve(import.meta.dirname, '../../..'), env: process.env, maxBuffer: 4 * 1024 * 1024 });
      const result = JSON.parse(stdout.trim()) as ImportScriptResult;
      await db.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'CUSTOMER_IMPORT_COMPLETED', entityType: 'CUSTOMER', entityId: 'bulk-import', after: { fileName: file.originalname, rowsRead: result.rowsRead, customersUpserted: result.customersUpserted, addressesInserted: result.addressesInserted, addressesUpdated: result.addressesUpdated }, timestamp: new Date() });
      const { source: _source, ...safeResult } = result;
      return { fileName: file.originalname, ...safeResult };
    } catch (error) {
      const childError = error as { stderr?: string; message?: string };
      throw new BadRequestException((childError.stderr?.trim() || childError.message || 'File gagal diproses.').replace(/\s+/g, ' ').slice(0, 500));
    } finally {
      if (file.path) await rm(file.path, { force: true });
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async import(admin: RequestAdmin, file: UploadedCustomerFile) {
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new BadRequestException('File harus berformat .xlsx atau .csv.');
    // The controller uses multer diskStorage, so normal uploads provide a
    // temporary file path rather than an in-memory buffer.
    if (!file.size || (!file.buffer?.length && !file.path)) throw new BadRequestException('File upload kosong.');
    if (file.size > MAX_UPLOAD_SIZE_BYTES) throw new BadRequestException('Ukuran file maksimal 50 MB. Gunakan beberapa file batch jika data lebih besar.');

    const storageDirectory = resolve(process.env.IMPORT_STORAGE_DIR ?? join(process.cwd(), 'var', 'imports'));
    await mkdir(storageDirectory, { recursive: true });
    const jobId = randomUUID();
    const storedPath = join(storageDirectory, `${jobId}${extension}`);
    try {
      if (file.path) await rename(file.path, storedPath);
      else await writeFile(storedPath, file.buffer!);
      await db.insert(importJobs).values({ id: jobId, fileName: file.originalname, filePath: storedPath, status: 'QUEUED', createdBy: admin.id, createdAt: new Date(), updatedAt: new Date() });
      await this.queue.add('process-customer-import', { importJobId: jobId }, { jobId, attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true, removeOnFail: false });
      return { jobId, fileName: file.originalname, status: 'QUEUED' as const };
    } catch (error) {
      await rm(storedPath, { force: true });
      const message = error instanceof Error ? error.message : 'File gagal diantrikan.';
      throw new BadRequestException(message.replace(/\s+/g, ' ').slice(0, 500));
    } finally {
      if (file.path) await rm(file.path, { force: true });
    }
  }

  async get(admin: RequestAdmin, id: string) {
    const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, id), eq(importJobs.createdBy, admin.id))).limit(1);
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
