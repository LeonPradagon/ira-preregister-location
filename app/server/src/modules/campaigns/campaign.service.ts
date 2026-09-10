import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  auditLogs,
  customerAddresses,
  customers,
  verificationCampaignItems,
  verificationCampaigns,
  verificationSessions,
} from '../../db/schema/index.js';
import {
  AdminListQueryInput,
  CampaignCreateInput,
  CampaignTargetFilterInput,
  WhatsAppPreviewInput,
} from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { RequestAdmin } from '../../common/request-user.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';
import { getWhatsAppTemplate, renderWhatsAppTemplate } from '../../integrations/whatsapp/whatsapp.templates.js';
import { ReadCacheService } from '../../common/read-cache.service.js';
import { decodeListCursor, encodeListCursor } from '../../common/list-cursor.js';
import { buildVerificationSimulationConfig } from '../verification/simulation-config.js';
import { getPublicWebOrigin } from '../../config/public-origin.js';
import {
  campaignRecipientReservationStatuses,
  selectCampaignTargetIds,
} from './campaign-target.policy.js';

const timestamp = () => new Date();
const canManage = (role: RequestAdmin['role']) => role === 'SUPER_ADMIN' || role === 'ADMIN';
const maxBatchSize = () => Number(process.env.CAMPAIGN_MAX_BATCH_SIZE ?? 1000);
const defaultMaterializationBatch = () => Number(process.env.CAMPAIGN_MATERIALIZATION_BATCH_SIZE ?? 1000);
type StoredTargetFilter = CampaignTargetFilterInput & { customerIds?: string[] };

function filtersForTarget(target: StoredTargetFilter, cursor?: string) {
  const filters = [];
  if (cursor) filters.push(gt(customers.id, cursor));
  if (target.customerIds?.length) filters.push(inArray(customers.id, target.customerIds));
  if (target.search) {
    const pattern = `%${target.search}%`;
    filters.push(
      or(
        ilike(customers.name, pattern),
        ilike(customers.externalId, pattern),
        ilike(customers.phoneE164, pattern),
        ilike(customers.sourceRecordId, pattern),
      ),
    );
  }
  if (target.status) filters.push(eq(customers.status, target.status));
  filters.push(ne(customers.status, 'SUSPENDED'), isNull(customers.whatsappOptOutAt));
  if (target.locationStatus === 'VERIFIED') {
    filters.push(
      sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = true)`,
    );
  } else {
    filters.push(
      sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = false)`,
    );
  }
  return and(...filters);
}

const campaignRecipientReservationFilter = () => {
  const statuses = sql.join(campaignRecipientReservationStatuses.map((status) => sql`${status}`), sql`, `);
  return sql`not exists (
    select 1
    from "verification_campaign_items" reserved_item
    where reserved_item."customer_id" = ${customers.id}
      and reserved_item."status" in (${statuses})
  ) and not exists (
    select 1
    from "verification_campaigns" reserved_campaign
    where reserved_campaign."status" in ('DRAFT', 'RUNNING')
      and reserved_campaign."target_filter" -> 'customerIds' ? (${customers.id})::text
  )`;
};

@Injectable()
export class CampaignService {
  constructor(
    private readonly validationConfig: ValidationConfigService,
    private readonly readCache: ReadCacheService,
  ) {}

  async previewWhatsApp(input: WhatsAppPreviewInput) {
    const template = getWhatsAppTemplate('INVITATION');
    const query = new URLSearchParams({ name: input.customerName });
    if (input.address) query.set('address', input.address);
    if (input.referenceLatitude != null && input.referenceLongitude != null) {
      query.set('referenceLatitude', String(input.referenceLatitude));
      query.set('referenceLongitude', String(input.referenceLongitude));
    }
    if (input.referencePrecision) query.set('referencePrecision', input.referencePrecision);
    const config = await this.validationConfig.get();
    query.set('homeRadiusMeters', String(config.HOME_RADIUS_METERS));
    query.set('gpsMaxAccuracyMeters', String(config.GPS_MAX_ACCURACY_METERS));
    query.set('manualReview', String(config.ENABLE_MANUAL_REVIEW));
    query.set('autoApprovalEnabled', String(config.ENABLE_AUTO_APPROVAL));
    query.set('autoApprovalScoreThreshold', String(Math.max(0.9, config.AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD)));
    const verificationLink = `${getPublicWebOrigin()}/v/simulasi-${randomUUID()}?${query.toString()}`;
    return {
      simulation: true,
      recipient: { name: input.customerName, phoneE164: input.phoneE164 },
      templateName: template.name,
      language: template.language,
      message: renderWhatsAppTemplate('INVITATION', input.customerName, verificationLink),
      verificationLink,
      referenceLocation:
        input.referenceLatitude == null || input.referenceLongitude == null
          ? null
          : { latitude: input.referenceLatitude, longitude: input.referenceLongitude },
      referencePrecision: input.referencePrecision ?? null,
      simulationConfig: buildVerificationSimulationConfig(config),
    };
  }

  async create(admin: RequestAdmin, input: CampaignCreateInput) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a campaign', 403, 'FORBIDDEN');
    const ids = input.customerIds ?? [];
    const config = await this.validationConfig.get();
    const requestedDailySendLimit = Math.min(
      Math.max(input.dailySendLimit ?? 500, 1),
      config.WHATSAPP_DAILY_SEND_LIMIT,
    );
    let target: StoredTargetFilter = input.targetFilter
      ? { ...input.targetFilter }
      : { locationStatus: 'UNVERIFIED', search: '', customerIds: ids };
    if (ids.length > maxBatchSize())
      throw new DomainError('Campaign batch is too large', 413, 'CAMPAIGN_BATCH_TOO_LARGE');

    if (input.targetFilter) {
      const candidateRows = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(filtersForTarget(target), campaignRecipientReservationFilter()))
        .orderBy(asc(customers.id))
        .limit(requestedDailySendLimit);
      target = {
        ...target,
        customerIds: selectCampaignTargetIds(
          candidateRows.map((customer) => customer.id),
          requestedDailySendLimit,
        ),
      };
    }

    const targetIds = target.customerIds ?? ids;
    const selected = targetIds.length
      ? await db
          .select({ id: customers.id, optedOut: customers.whatsappOptOutAt })
          .from(customers)
          .where(and(filtersForTarget(target), campaignRecipientReservationFilter()))
      : [];
    const targetCount = selected.length;
    if (ids.length > requestedDailySendLimit)
      throw new DomainError('Selected recipients exceed the daily send limit', 422, 'CAMPAIGN_DAILY_LIMIT_EXCEEDED');
    if (selected.length !== targetIds.length)
      throw new DomainError(
        'One or more selected customers are already reserved by another delivery or are no longer eligible',
        409,
        'CAMPAIGN_CUSTOMERS_UNAVAILABLE',
      );
    if (!targetCount) throw new DomainError('Campaign has no eligible customers', 422, 'CAMPAIGN_TARGET_EMPTY');

    const campaignId = randomUUID();
    const created = timestamp();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : created;
    const requestedBatchSize = input.batchSize ?? Number(process.env.CAMPAIGN_DEFAULT_BATCH_SIZE ?? 500);
    const requestedWindowDays = input.sendWindowDays ?? Number(process.env.CAMPAIGN_DEFAULT_SEND_WINDOW_DAYS ?? 0);
    const materializationBatch = Math.min(requestedBatchSize, maxBatchSize(), defaultMaterializationBatch());
    await db.insert(verificationCampaigns).values({
      id: campaignId,
      name: input.name,
      status: 'DRAFT',
      timezone: input.timezone,
      scheduledAt,
      targetCount,
      sentCount: 0,
      failedCount: 0,
      optedOutCount: 0,
      targetFilter: target,
      batchSize: materializationBatch,
      dailySendLimit: requestedDailySendLimit,
      sendWindowDays: requestedWindowDays,
      materializationComplete: false,
      materializedCount: 0,
      createdBy: admin.id,
      createdAt: created,
      updatedAt: created,
    });
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'CAMPAIGN_CREATED',
      entityType: 'CAMPAIGN',
      entityId: campaignId,
      after: {
        targetCount,
        batchSize: materializationBatch,
        dailySendLimit: requestedDailySendLimit,
        sendWindowDays: requestedWindowDays,
        filter: target.locationStatus,
      },
      timestamp: created,
    });
    return {
      id: campaignId,
      name: input.name,
      status: 'DRAFT',
      timezone: input.timezone,
      scheduledAt,
      targetCount,
      sentCount: 0,
      failedCount: 0,
      materializedCount: 0,
      dailySendLimit: requestedDailySendLimit,
    };
  }

  async start(admin: RequestAdmin, campaignId: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot start a campaign', 403, 'FORBIDDEN');
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (campaign.status !== 'DRAFT') throw new DomainError('Campaign is not in draft state', 409, 'CAMPAIGN_NOT_DRAFT');
    const updatedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx
        .update(verificationCampaigns)
        .set({ status: 'RUNNING', updatedAt })
        .where(eq(verificationCampaigns.id, campaignId));
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CAMPAIGN_STARTED',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        before: { status: 'DRAFT' },
        after: { status: 'RUNNING' },
        timestamp: updatedAt,
      });
    });
    return { id: campaignId, status: 'RUNNING' };
  }

  async list(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(ilike(verificationCampaigns.name, pattern), sql`${verificationCampaigns.id}::text ilike ${pattern}`),
      );
    }
    if (query.status)
      filters.push(eq(verificationCampaigns.status, query.status as typeof verificationCampaigns.$inferSelect.status));
    const where = and(...filters);
    const cachedCount = await this.readCache.count(
      'campaigns',
      { search: query.search, status: query.status },
      async () => {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(verificationCampaigns)
          .where(where);
        return Number(total);
      },
    );
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(verificationCampaigns.createdAt, new Date(cursor.value)),
          and(eq(verificationCampaigns.createdAt, new Date(cursor.value)), lt(verificationCampaigns.id, cursor.id)),
        )
      : undefined;
    const items = await db
      .select()
      .from(verificationCampaigns)
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(desc(verificationCampaigns.createdAt), desc(verificationCampaigns.id))
      .offset(cursor ? 0 : (query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        items.length === query.pageSize
          ? encodeListCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
          : null,
      hasMore: items.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
    };
  }

  async detail(campaignId: string) {
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    return { campaign, items: await this.items(campaignId, { page: 1, pageSize: 25, search: '' }) };
  }

  async items(campaignId: string, query: AdminListQueryInput) {
    const [campaign] = await db
      .select({ id: verificationCampaigns.id })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    const itemFilters = [eq(verificationCampaignItems.campaignId, campaignId)];
    if (query.search) {
      const pattern = `%${query.search}%`;
      itemFilters.push(
        or(
          ilike(customers.name, pattern),
          ilike(customers.externalId, pattern),
          ilike(customers.phoneE164, pattern),
        ) as (typeof itemFilters)[number],
      );
    }
    const cachedCount = await this.readCache.count('campaign-items', { campaignId, search: query.search }, async () => {
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(verificationCampaignItems)
        .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
        .where(and(...itemFilters));
      return Number(total);
    });
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(verificationCampaignItems.createdAt, new Date(cursor.value)),
          and(
            eq(verificationCampaignItems.createdAt, new Date(cursor.value)),
            lt(verificationCampaignItems.id, cursor.id),
          ),
        )
      : undefined;
    const items = await db
      .select({
        item: verificationCampaignItems,
        customer: customers,
        sessionStatus: verificationSessions.verificationStatus,
      })
      .from(verificationCampaignItems)
      .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
      .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
      .where(cursorWhere ? and(...itemFilters, cursorWhere) : and(...itemFilters))
      .orderBy(desc(verificationCampaignItems.createdAt), desc(verificationCampaignItems.id))
      .offset(cursor ? 0 : (query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        items.length === query.pageSize
          ? encodeListCursor(items[items.length - 1].item.createdAt, items[items.length - 1].item.id)
          : null,
      hasMore: items.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
    };
  }

  async materializeNext(campaignId: string) {
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign || campaign.status !== 'RUNNING' || campaign.materializationComplete)
      return { done: true, inserted: 0 };
    const stored = (
      campaign.targetFilter && typeof campaign.targetFilter === 'object' ? campaign.targetFilter : {}
    ) as StoredTargetFilter;
    const candidateRows = await db
      .select()
      .from(customers)
      .where(filtersForTarget(stored, campaign.materializationCursor ?? undefined))
      .orderBy(asc(customers.id))
      .limit(campaign.batchSize);
    if (!candidateRows.length) {
      await db
        .update(verificationCampaigns)
        .set({ materializationComplete: true, updatedAt: timestamp() })
        .where(eq(verificationCampaigns.id, campaignId));
      return { done: true, inserted: 0 };
    }
    const candidateIds = candidateRows.map((customer) => customer.id);
    const addressRows = await db
      .select()
      .from(customerAddresses)
      .where(and(inArray(customerAddresses.customerId, candidateIds), eq(customerAddresses.isActive, true)))
      .orderBy(desc(customerAddresses.updatedAt));
    const addressByCustomer = new Map<string, (typeof addressRows)[number]>();
    for (const address of addressRows)
      if (!addressByCustomer.has(address.customerId)) addressByCustomer.set(address.customerId, address);
    const targets = candidateRows
      .map((customer) => ({ customer, address: addressByCustomer.get(customer.id) }))
      .filter((target): target is { customer: (typeof candidateRows)[number]; address: (typeof addressRows)[number] } =>
        Boolean(target.address),
      );
    const now = timestamp();
    const windowMs = Math.max(0, campaign.sendWindowDays) * 86400000;
    const sessions = targets.map(({ customer, address }) => {
      const id = randomUUID();
      return {
        id,
        campaignId,
        customerId: customer.id,
        currentAddressId: address.id,
        tokenHash: null,
        tokenId: null,
        expiresAt: new Date(
          Math.max(campaign.scheduledAt.getTime(), now.getTime()) +
            windowMs +
            Number(process.env.VERIFICATION_TOKEN_TTL_DAYS ?? 7) * 86400000,
        ),
        verificationStatus: 'CREATED',
        customerConfirmationStatus: 'UNCONFIRMED',
        registeredPhoneSnapshot: customer.phoneE164,
        createdAt: now,
        updatedAt: now,
      };
    });
    await db.transaction(async (tx) => {
      if (sessions.length) {
        await tx.insert(verificationSessions).values(sessions);
        await tx.insert(verificationCampaignItems).values(
          targets.map(({ customer, address }, index) => ({
            id: randomUUID(),
            campaignId,
            customerId: customer.id,
            addressId: address.id,
            sessionId: sessions[index].id,
            status: 'PENDING',
            scheduledAt: new Date(
              Math.max(campaign.scheduledAt.getTime(), now.getTime()) +
                Math.floor(((campaign.materializedCount + index) / Math.max(campaign.targetCount, 1)) * windowMs),
            ),
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
      const lastCandidateId = candidateRows[candidateRows.length - 1].id;
      await tx
        .update(verificationCampaigns)
        .set({
          materializationCursor: lastCandidateId,
          materializedCount: campaign.materializedCount + sessions.length,
          materializationComplete: candidateRows.length < campaign.batchSize,
          updatedAt: now,
        })
        .where(eq(verificationCampaigns.id, campaignId));
      await tx.insert(auditLogs).values({
        actorUserId: 'system',
        actorName: 'Campaign Materializer',
        action: 'CAMPAIGN_TARGETS_MATERIALIZED',
        entityType: 'CAMPAIGN',
        entityId: campaignId,
        after: {
          scanned: candidateRows.length,
          inserted: sessions.length,
          materializedCount: campaign.materializedCount + sessions.length,
        },
        timestamp: now,
      });
    });
    return { done: candidateRows.length < campaign.batchSize, inserted: sessions.length };
  }

  async refreshStatus(campaignId: string) {
    const [counts] = await db
      .select({
        sent: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('SENT', 'DELIVERED', 'READ'))`,
        failed: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('FAILED', 'PROVIDER_UNAVAILABLE', 'OPTED_OUT'))`,
        pending: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('PENDING', 'PROCESSING'))`,
      })
      .from(verificationCampaignItems)
      .where(eq(verificationCampaignItems.campaignId, campaignId));
    const [campaign] = await db
      .select({
        materializationComplete: verificationCampaigns.materializationComplete,
        status: verificationCampaigns.status,
      })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) return;
    const status =
      campaign.status === 'PAUSED'
        ? 'PAUSED'
        : campaign.materializationComplete && Number(counts.pending) === 0
          ? 'COMPLETED'
          : 'RUNNING';
    await db
      .update(verificationCampaigns)
      .set({ sentCount: Number(counts.sent), failedCount: Number(counts.failed), status, updatedAt: timestamp() })
      .where(eq(verificationCampaigns.id, campaignId));
  }
}
