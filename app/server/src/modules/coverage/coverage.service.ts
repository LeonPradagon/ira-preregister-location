import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  auditLogs,
  coverageCheckBatches,
  coverageChecks,
  customerAddresses,
  customers,
  verificationSessions,
} from '../../db/schema/index.js';
import type { CoverageCandidateQueryInput, CoverageCheckCreateInput } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import type { RequestAdmin } from '../../common/request-user.js';
import { queueNames } from '../../common/queue-names.js';

const PROVIDER_KEY = 'FWA';
const now = () => new Date();

type CandidateRow = {
  session: typeof verificationSessions.$inferSelect;
  customer: typeof customers.$inferSelect;
  address: typeof customerAddresses.$inferSelect;
  latitude: string | null;
  longitude: string | null;
  latestCoverageStatus: string | null;
  latestCoverageCheckedAt: Date | null;
  importedCoverageStatus: string | null;
};

@Injectable()
export class CoverageService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  }).on('error', () => undefined);
  private readonly queue = new Queue(queueNames.coverage, { connection: this.connection });

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }

  private latestLatitude = () => sql<string | null>`(
    select latest_result.captured_latitude
    from validation_results latest_result
    where latest_result.session_id = ${verificationSessions.id}
      and latest_result.address_id = ${verificationSessions.currentAddressId}
    order by latest_result.created_at desc, latest_result.id desc
    limit 1
  )`;

  private latestLongitude = () => sql<string | null>`(
    select latest_result.captured_longitude
    from validation_results latest_result
    where latest_result.session_id = ${verificationSessions.id}
      and latest_result.address_id = ${verificationSessions.currentAddressId}
    order by latest_result.created_at desc, latest_result.id desc
    limit 1
  )`;

  private latestCheckStatus = () => sql<string | null>`(
    select latest_check.status
    from coverage_checks latest_check
    where latest_check.verification_session_id = ${verificationSessions.id}
      and latest_check.provider_key = ${PROVIDER_KEY}
    order by latest_check.created_at desc, latest_check.id desc
    limit 1
  )`;

  private latestCheckCreatedAt = () => sql<Date | null>`(
    select latest_check.created_at
    from coverage_checks latest_check
    where latest_check.verification_session_id = ${verificationSessions.id}
      and latest_check.provider_key = ${PROVIDER_KEY}
    order by latest_check.created_at desc, latest_check.id desc
    limit 1
  )`;

  private candidateFilters(query: CoverageCandidateQueryInput, ids?: string[]) {
    const latestStatus = this.latestCheckStatus();
    const filters = [
      eq(verificationSessions.verificationStatus, 'LOCATION_VALID'),
      eq(customerAddresses.isVerified, true),
      sql`${this.latestLatitude()} is not null`,
      sql`${this.latestLongitude()} is not null`,
    ];
    if (ids?.length) filters.push(inArray(verificationSessions.id, ids));
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          ilike(customers.name, pattern),
          ilike(customers.externalId, pattern),
          ilike(customers.phoneE164, pattern),
          ilike(customerAddresses.rawAddress, pattern),
        )!,
      );
    }
    if (query.status) {
      filters.push(sql`coalesce(${latestStatus}, 'NOT_CHECKED') = ${query.status}`);
    }
    return filters;
  }

  private candidateSelection() {
    return {
      session: verificationSessions,
      customer: customers,
      address: customerAddresses,
      latitude: this.latestLatitude(),
      longitude: this.latestLongitude(),
      latestCoverageStatus: this.latestCheckStatus(),
      latestCoverageCheckedAt: this.latestCheckCreatedAt(),
      importedCoverageStatus: customers.coverageFwaStatus,
    };
  }

  async listCandidates(query: CoverageCandidateQueryInput) {
    const filters = this.candidateFilters(query);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .where(and(...filters));
    const rows = await db
      .select(this.candidateSelection())
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .where(and(...filters))
      .orderBy(
        sql`case
          when coalesce(${this.latestCheckStatus()}, 'NOT_CHECKED') = 'NOT_CHECKED'
            and ${customers.coverageFwaStatus} = 'Not Coverage' then 0
          when coalesce(${this.latestCheckStatus()}, 'NOT_CHECKED') = 'NOT_CHECKED' then 1
          when coalesce(${this.latestCheckStatus()}, 'NOT_CHECKED') = 'UNCOVERED' then 2
          when coalesce(${this.latestCheckStatus()}, 'NOT_CHECKED') = 'FAILED' then 3
          else 4
        end`,
        desc(verificationSessions.locationVerifiedAt),
        desc(verificationSessions.id),
      )
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    return {
      items: rows.map((row) => this.mapCandidate(row)),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / query.pageSize),
    };
  }

  private mapCandidate(row: CandidateRow) {
    const latestStatus = row.latestCoverageStatus ?? 'NOT_CHECKED';
    return {
      verificationId: row.session.id,
      customerId: row.customer.id,
      customerExternalId: row.customer.externalId,
      customerName: row.customer.name,
      addressId: row.address.id,
      address: row.address.rawAddress,
      verificationStatus: row.session.verificationStatus,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      coverageStatus: latestStatus,
      lastCheckedAt: row.latestCoverageCheckedAt,
      importedCoverageStatus: row.importedCoverageStatus,
    };
  }

  async enqueue(admin: RequestAdmin, input: CoverageCheckCreateInput) {
    if (process.env.ENABLE_IRA_COVERAGE !== 'true')
      throw new DomainError('Coverage FWA belum diaktifkan. Set ENABLE_IRA_COVERAGE=true.', 409, 'COVERAGE_DISABLED');
    if (!process.env.FWA_COVERAGE_BASE_URL || !process.env.FWA_COVERAGE_API_KEY)
      throw new DomainError('Konfigurasi API Coverage FWA belum lengkap.', 503, 'COVERAGE_NOT_CONFIGURED');

    const query: CoverageCandidateQueryInput = { page: 1, pageSize: 5000, search: '' };
    const rows = await db
      .select(this.candidateSelection())
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .where(and(...this.candidateFilters(query, input.verificationIds)));
    if (!rows.length) throw new DomainError('Tidak ada verification terpilih yang eligible untuk dicek.', 409, 'NO_ELIGIBLE_COVERAGE_TARGETS');

    const requestedAt = now();
    const batchId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(coverageCheckBatches).values({
        id: batchId,
        providerKey: PROVIDER_KEY,
        status: 'QUEUED',
        totalCount: rows.length,
        requestedBy: admin.id,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      });
      await tx.insert(coverageChecks).values(
        rows.map((row) => ({
          id: randomUUID(),
          batchId,
          providerKey: PROVIDER_KEY,
          verificationSessionId: row.session.id,
          customerId: row.customer.id,
          addressId: row.address.id,
          latitude: String(row.latitude),
          longitude: String(row.longitude),
          status: 'QUEUED',
          requestedBy: admin.id,
          requestedAt,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })),
      );
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'COVERAGE_CHECK_QUEUED',
        entityType: 'COVERAGE_BATCH',
        entityId: batchId,
        after: { provider: PROVIDER_KEY, requestedCount: input.verificationIds.length, queuedCount: rows.length },
        timestamp: requestedAt,
      });
    });

    try {
      await this.queue.add('coverage-check', { batchId }, { jobId: batchId, removeOnComplete: 100, removeOnFail: 100 });
    } catch (error) {
      await db
        .update(coverageCheckBatches)
        .set({ status: 'FAILED', failedCount: rows.length, completedAt: now(), updatedAt: now() })
        .where(eq(coverageCheckBatches.id, batchId));
      throw error;
    }
    return { batchId, queuedCount: rows.length, skippedCount: input.verificationIds.length - rows.length };
  }

  async getBatch(batchId: string) {
    const [batch] = await db.select().from(coverageCheckBatches).where(eq(coverageCheckBatches.id, batchId)).limit(1);
    if (!batch) throw new NotFoundError('Coverage batch tidak ditemukan.');
    const checks = await db
      .select({ check: coverageChecks, customerName: customers.name, customerExternalId: customers.externalId })
      .from(coverageChecks)
      .innerJoin(customers, eq(customers.id, coverageChecks.customerId))
      .where(eq(coverageChecks.batchId, batchId))
      .orderBy(desc(coverageChecks.createdAt));
    return { batch, items: checks };
  }
}
