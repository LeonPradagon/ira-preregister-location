import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  auditLogs,
  customerAddresses,
  customers,
  locationCaptures,
  reminders,
  validationResults,
  verificationCampaignItems,
  verificationCampaigns,
  verificationSessions,
  whatsappDeliveryLogs,
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
import {
  decodeCustomerNameCursor,
  decodeListCursor,
  encodeCustomerNameCursor,
  encodeListCursor,
} from '../../common/list-cursor.js';
import { buildVerificationSimulationConfig } from '../verification/simulation-config.js';
import { getPublicWebOrigin } from '../../config/public-origin.js';
import {
  campaignCoverageFilterWithMissingReferenceLocation,
  campaignNeedsMaterialization,
  campaignRecipientReservationStatuses,
  selectCampaignTargetIds,
  selectMaterializationTargetIds,
} from './campaign-target.policy.js';
import { campaignEligibleAddressSql } from '../validation/address-completeness.sql.js';
import { verificationSessionExpiresAt } from '../reminders/reminder.policy.js';
import { AUTO_APPROVAL_SCORE_MIN } from '../../config/validation-thresholds.js';
import {
  campaignExportContentTypes,
  campaignExportStatusLabels,
  createCampaignCsv,
  createCampaignXlsx,
  type CampaignExportRow,
} from './campaign-export.js';

const timestamp = () => new Date();
const canManage = (role: RequestAdmin['role']) => role === 'SUPER_ADMIN' || role === 'ADMIN';
const maxBatchSize = () => Number(process.env.CAMPAIGN_MAX_BATCH_SIZE ?? 1000);
const defaultMaterializationBatch = () => Number(process.env.CAMPAIGN_MATERIALIZATION_BATCH_SIZE ?? 1000);
type StoredTargetFilter = CampaignTargetFilterInput & { customerIds?: string[] };

const exportDate = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);
const exportNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const exportJson = (value: unknown): string => {
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

function exportAddressText(address: Record<string, unknown> | null | undefined): string {
  if (!address) return '';
  const rawAddress = String(address.rawAddress ?? '').trim();
  if (rawAddress) return rawAddress;
  const parts = [
    address.street,
    address.houseNumber && `No. ${address.houseNumber}`,
    address.rt && `RT ${address.rt}`,
    address.rw && `RW ${address.rw}`,
    address.building,
    address.block && `Blok ${address.block}`,
    address.unit && `Unit ${address.unit}`,
    address.addressDetail,
    address.landmark,
    address.subdistrict,
    address.district,
    address.city,
    address.province,
    address.postalCode,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

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
  const coverageFilters = [];
  if (target.coverageFwaStatus) coverageFilters.push(eq(customers.coverageFwaStatus, target.coverageFwaStatus));
  if (target.coverageFtthStatus) coverageFilters.push(eq(customers.coverageFtthStatus, target.coverageFtthStatus));
  const coverageFilter =
    target.locationStatus === 'VERIFIED'
      ? and(...coverageFilters)
      : campaignCoverageFilterWithMissingReferenceLocation(and(...coverageFilters));
  if (coverageFilter) filters.push(coverageFilter);
  filters.push(ne(customers.status, 'SUSPENDED'), isNull(customers.whatsappOptOutAt));
  if (target.locationStatus === 'VERIFIED') {
    filters.push(
      sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = true)`,
    );
  } else {
    filters.push(
      sql`exists (
        select 1
        from customer_addresses campaign_address
        where campaign_address.customer_id = ${customers.id}
          and campaign_address.is_active = true
          and campaign_address.is_verified = false
          and ${campaignEligibleAddressSql('campaign_address')}
      )`,
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
    -- Fully materialized RUNNING campaigns are covered by the indexed item
    -- reservation above. Evaluating their large JSON customer-id array for
    -- every customer makes candidate loading time out on large imports.
    where (
      reserved_campaign."status" = 'DRAFT'
      or (
        reserved_campaign."status" = 'RUNNING'
        and reserved_campaign."materialization_complete" = false
      )
    )
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
    query.set('autoApprovalScoreThreshold', String(Math.max(AUTO_APPROVAL_SCORE_MIN, config.AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD)));
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
    const usesNameCursor = query.sortBy === 'campaign' && query.sortDirection !== 'desc';
    const usesCursor = !query.sortBy || usesNameCursor;
    const sortDirection = query.sortDirection === 'desc' ? 'desc' : 'asc';
    const sortExpression =
      query.sortBy === 'target'
        ? verificationCampaigns.targetCount
        : query.sortBy === 'sent'
          ? verificationCampaigns.sentCount
          : query.sortBy === 'failed'
            ? verificationCampaigns.failedCount
            : query.sortBy === 'status'
              ? verificationCampaigns.status
              : verificationCampaigns.name;
    const nameCursor = usesNameCursor ? decodeCustomerNameCursor(query.cursor) : null;
    const cursor = usesCursor && !usesNameCursor ? decodeListCursor(query.cursor) : undefined;
    const cursorWhere = nameCursor
      ? or(
          gt(verificationCampaigns.name, nameCursor.name),
          and(eq(verificationCampaigns.name, nameCursor.name), gt(verificationCampaigns.id, nameCursor.id)),
        )
      : cursor
      ? or(
          lt(verificationCampaigns.createdAt, new Date(cursor.value)),
          and(eq(verificationCampaigns.createdAt, new Date(cursor.value)), lt(verificationCampaigns.id, cursor.id)),
        )
      : undefined;
    const items = await db
      .select()
      .from(verificationCampaigns)
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(
        usesNameCursor
          ? asc(verificationCampaigns.name)
          : usesCursor
          ? desc(verificationCampaigns.createdAt)
          : sortDirection === 'desc'
            ? desc(sortExpression)
            : asc(sortExpression),
        usesNameCursor
          ? asc(verificationCampaigns.id)
          : usesCursor
          ? desc(verificationCampaigns.id)
          : sortDirection === 'desc'
            ? desc(verificationCampaigns.id)
            : asc(verificationCampaigns.id),
      )
      .offset((usesNameCursor && nameCursor) || (usesCursor && cursor) ? 0 : (query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        usesNameCursor && items.length === query.pageSize
          ? encodeCustomerNameCursor(items[items.length - 1].name, items[items.length - 1].id)
          : usesCursor && items.length === query.pageSize
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

  async exportCampaign(
    admin: Pick<RequestAdmin, 'id' | 'name'>,
    campaignId: string,
    format: 'xlsx' | 'csv',
  ): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');

    const itemRows = await db
      .select({
        item: verificationCampaignItems,
        customer: customers,
        session: verificationSessions,
        currentAddress: {
          id: customerAddresses.id,
          rawAddress: customerAddresses.rawAddress,
          street: customerAddresses.street,
          houseNumber: customerAddresses.houseNumber,
          rt: customerAddresses.rt,
          rw: customerAddresses.rw,
          building: customerAddresses.building,
          block: customerAddresses.block,
          unit: customerAddresses.unit,
          subdistrict: customerAddresses.subdistrict,
          district: customerAddresses.district,
          city: customerAddresses.city,
          province: customerAddresses.province,
          postalCode: customerAddresses.postalCode,
          addressDetail: customerAddresses.addressDetail,
          landmark: customerAddresses.landmark,
        },
        delivery: {
          deliveredAt: whatsappDeliveryLogs.deliveredAt,
          readAt: whatsappDeliveryLogs.readAt,
        },
        addressChanged: sql<boolean>`
          ${verificationSessions.verificationStatus} in ('ADDRESS_EDITING', 'ADDRESS_PROPOSED')
          or ${verificationSessions.currentAddressId} <> ${verificationCampaignItems.addressId}
          or exists (
            select 1 from ${auditLogs}
            where ${auditLogs.action} = 'ADDRESS_PROPOSED'
              and ${auditLogs.entityType} = 'ADDRESS'
              and (${auditLogs.after} ->> 'sessionId') = (${verificationSessions.id}::text)
          )`,
      })
      .from(verificationCampaignItems)
      .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
      .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
      .leftJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .leftJoin(
        whatsappDeliveryLogs,
        eq(whatsappDeliveryLogs.providerMessageId, verificationCampaignItems.providerMessageId),
      )
      .where(eq(verificationCampaignItems.campaignId, campaignId))
      .orderBy(desc(verificationCampaignItems.createdAt), desc(verificationCampaignItems.id));

    const sessionIds = itemRows.map((row) => row.session.id);
    const addressIds = [...new Set(itemRows.flatMap((row) => [row.item.addressId, row.session.currentAddressId]))];
    const [addressRows, reminderRows, captureRows, validationRows] = sessionIds.length
      ? await Promise.all([
          db.select().from(customerAddresses).where(inArray(customerAddresses.id, addressIds)),
          db.select().from(reminders).where(inArray(reminders.sessionId, sessionIds)).orderBy(asc(reminders.reminderNumber), asc(reminders.createdAt)),
          db.select().from(locationCaptures).where(inArray(locationCaptures.sessionId, sessionIds)).orderBy(desc(locationCaptures.serverTimestamp)),
          db.select().from(validationResults).where(inArray(validationResults.sessionId, sessionIds)).orderBy(desc(validationResults.createdAt)),
        ])
      : [[], [], [], []];

    const addressById = new Map(addressRows.map((address) => [address.id, address]));
    const remindersBySession = new Map<string, typeof reminderRows>();
    for (const reminder of reminderRows) remindersBySession.set(reminder.sessionId, [...(remindersBySession.get(reminder.sessionId) ?? []), reminder]);
    const capturesBySession = new Map<string, typeof captureRows>();
    for (const capture of captureRows) capturesBySession.set(capture.sessionId, [...(capturesBySession.get(capture.sessionId) ?? []), capture]);
    const validationsBySession = new Map<string, typeof validationRows>();
    for (const validation of validationRows) validationsBySession.set(validation.sessionId, [...(validationsBySession.get(validation.sessionId) ?? []), validation]);

    const detailRows: CampaignExportRow[] = itemRows.map((row) => {
      const originalAddress = addressById.get(row.item.addressId);
      const currentAddress = row.currentAddress as Record<string, unknown> | null;
      const remindersForSession = remindersBySession.get(row.session.id) ?? [];
      const capturesForSession = capturesBySession.get(row.session.id) ?? [];
      const validationsForSession = validationsBySession.get(row.session.id) ?? [];
      const latestCapture = capturesForSession[0];
      const latestValidation = validationsForSession[0];
      return {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        campaign_status: campaignExportStatusLabels[campaign.status] ?? campaign.status,
        campaign_scheduled_at: exportDate(campaign.scheduledAt),
        item_id: row.item.id,
        customer_id: row.customer.id,
        customer_external_id: row.customer.externalId,
        customer_name: row.customer.name,
        phone_number: row.customer.phoneE164,
        customer_status: campaignExportStatusLabels[row.customer.status] ?? row.customer.status,
        coverage_fwa: row.customer.coverageFwaStatus,
        coverage_ftth: row.customer.coverageFtthStatus,
        delivery_status: campaignExportStatusLabels[row.item.status] ?? row.item.status,
        scheduled_at: exportDate(row.item.scheduledAt),
        processing_started_at: exportDate(row.item.processingStartedAt),
        sent_at: exportDate(row.item.sentAt),
        delivered_at: exportDate(row.item.deliveredAt ?? row.delivery?.deliveredAt),
        read_at: exportDate(row.item.readAt ?? row.delivery?.readAt),
        failed_at: exportDate(row.item.failedAt),
        provider_message_id: row.item.providerMessageId,
        retry_count: row.item.retryCount,
        delivery_error: row.item.lastError,
        session_id: row.session.id,
        session_status: campaignExportStatusLabels[row.session.verificationStatus] ?? row.session.verificationStatus,
        customer_confirmation_status:
          campaignExportStatusLabels[row.session.customerConfirmationStatus] ?? row.session.customerConfirmationStatus,
        link_opened_at: exportDate(row.session.openedAt),
        customer_confirmed_at: exportDate(row.session.customerConfirmedAt),
        consent_at: exportDate(row.session.consentAt),
        location_verified_at: exportDate(row.session.locationVerifiedAt),
        completed_at: exportDate(row.session.completedAt),
        session_expires_at: exportDate(row.session.expiresAt),
        attempt_count: row.session.attemptCount,
        reminder_count: row.session.reminderCount,
        original_address_id: row.item.addressId,
        original_address: exportAddressText(originalAddress as unknown as Record<string, unknown> | null),
        current_address_id: row.session.currentAddressId,
        current_address: exportAddressText(currentAddress),
        address_changed: Boolean(row.addressChanged) ? 'Ya' : 'Tidak',
        gps_received: capturesForSession.length > 0 ? 'Ya' : 'Belum',
        latest_gps_latitude: exportNumber(latestCapture?.latitude),
        latest_gps_longitude: exportNumber(latestCapture?.longitude),
        latest_gps_accuracy_meters: exportNumber(latestCapture?.accuracyMeters),
        latest_gps_server_timestamp: exportDate(latestCapture?.serverTimestamp),
        latest_gps_device_timestamp: exportDate(latestCapture?.deviceTimestamp),
        location_valid: row.session.verificationStatus === 'LOCATION_VALID' ? 'Ya' : 'Belum',
        manual_review: row.session.verificationStatus === 'MANUAL_REVIEW' ? 'Ya' : 'Tidak',
        latest_validation_result: latestValidation?.result ?? null,
        validation_reason_codes: latestValidation ? exportJson(latestValidation.reasonCodes) : '',
        validation_address_score: exportNumber(latestValidation?.addressScore),
        validation_distance_meters: exportNumber(latestValidation?.distanceToReferenceMeters),
        validation_street_score: exportNumber(latestValidation?.streetScore),
        validation_reference_precision: latestValidation?.referencePrecision ?? null,
        validation_created_at: exportDate(latestValidation?.createdAt),
        reminder_sent_count: remindersForSession.filter((reminder) => reminder.status === 'SENT').length,
        reminder_last_sent_at: exportDate(remindersForSession.filter((reminder) => reminder.status === 'SENT').at(-1)?.sentAt),
        reminder_history: exportJson(
          remindersForSession.map((reminder) => ({
            reminderNumber: reminder.reminderNumber,
            status: reminder.status,
            scheduledAt: exportDate(reminder.scheduledAt),
            sentAt: exportDate(reminder.sentAt),
            openedAt: exportDate(reminder.openedAt),
            providerMessageId: reminder.providerMessageId,
            retryCount: reminder.retryCount,
          })),
        ),
        gps_history: exportJson(
          capturesForSession.map((capture) => ({
            latitude: exportNumber(capture.latitude),
            longitude: exportNumber(capture.longitude),
            accuracyMeters: exportNumber(capture.accuracyMeters),
            bestAccuracyMeters: exportNumber(capture.bestAccuracyMeters),
            sampleCount: capture.sampleCount,
            deviceTimestamp: exportDate(capture.deviceTimestamp),
            serverTimestamp: exportDate(capture.serverTimestamp),
          })),
        ),
        validation_history: exportJson(
          validationsForSession.map((validation) => ({
            result: validation.result,
            reasonCodes: validation.reasonCodes,
            addressScore: exportNumber(validation.addressScore),
            distanceToReferenceMeters: exportNumber(validation.distanceToReferenceMeters),
            streetScore: exportNumber(validation.streetScore),
            referencePrecision: validation.referencePrecision,
            createdAt: exportDate(validation.createdAt),
          })),
        ),
      };
    });

    const summaryRows: CampaignExportRow[] = [
      { field: 'Nama campaign', value: campaign.name },
      { field: 'Status campaign', value: campaignExportStatusLabels[campaign.status] ?? campaign.status },
      { field: 'Jadwal campaign', value: exportDate(campaign.scheduledAt) },
      { field: 'Jumlah target', value: campaign.targetCount },
      { field: 'Jumlah penerima yang tersedia', value: detailRows.length },
      { field: 'Sudah diterima provider', value: itemRows.filter((row) => ['SENT', 'DELIVERED', 'READ'].includes(row.item.status)).length },
      { field: 'Gagal atau dihentikan', value: itemRows.filter((row) => ['FAILED', 'PROVIDER_UNAVAILABLE', 'OPTED_OUT'].includes(row.item.status)).length },
      { field: 'Link sudah dibuka', value: itemRows.filter((row) => row.session.openedAt != null).length },
      { field: 'Data sudah dikonfirmasi', value: itemRows.filter((row) => row.session.customerConfirmationStatus === 'CONFIRMED').length },
      { field: 'Lokasi HP sudah diterima', value: itemRows.filter((row) => capturesBySession.has(row.session.id)).length },
      { field: 'Alamat berubah', value: itemRows.filter((row) => Boolean(row.addressChanged)).length },
      { field: 'Lokasi sesuai', value: itemRows.filter((row) => row.session.verificationStatus === 'LOCATION_VALID').length },
      { field: 'Perlu pemeriksaan tim', value: itemRows.filter((row) => row.session.verificationStatus === 'MANUAL_REVIEW').length },
      { field: 'Total reminder', value: reminderRows.length },
      { field: 'Reminder terkirim', value: reminderRows.filter((reminder) => reminder.status === 'SENT').length },
      { field: 'File dibuat pada', value: new Date().toISOString() },
    ];

    const body =
      format === 'xlsx'
        ? await createCampaignXlsx(summaryRows, detailRows)
        : createCampaignCsv(detailRows);
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'CAMPAIGN_EXPORT_COMPLETED',
      entityType: 'CAMPAIGN',
      entityId: campaign.id,
      after: { format, rows: detailRows.length },
      reason: 'Admin mengekspor detail monitoring campaign.',
      timestamp: timestamp(),
    });
    return {
      body,
      contentType: campaignExportContentTypes[format],
      fileName: `ira_campaign_${campaign.id}_${format === 'xlsx' ? 'monitoring' : 'monitoring'}.${format}`,
    };
  }

  async items(campaignId: string, query: AdminListQueryInput) {
    const [campaign] = await db
      .select({ id: verificationCampaigns.id })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    const campaignSessionFilter = sql`${reminders.sessionId} in (
      select ${verificationCampaignItems.sessionId}
      from ${verificationCampaignItems}
      where ${verificationCampaignItems.campaignId} = ${campaignId}
    )`;
    const [[monitoring], [reminderMonitoring], reminderNumberRows] = await Promise.all([
      db
        .select({
          target: sql<number>`count(*)`,
          pending: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('PENDING', 'PROCESSING'))`,
          sent: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('SENT', 'DELIVERED', 'READ'))`,
          delivered: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('DELIVERED', 'READ'))`,
          read: sql<number>`count(*) filter (where ${verificationCampaignItems.status} = 'READ')`,
          failed: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('FAILED', 'PROVIDER_UNAVAILABLE', 'OPTED_OUT'))`,
          linksOpened: sql<number>`count(*) filter (where ${verificationSessions.openedAt} is not null)`,
          confirmed: sql<number>`count(*) filter (where ${verificationSessions.customerConfirmationStatus} = 'CONFIRMED')`,
          gpsReceived: sql<number>`count(*) filter (where exists (
            select 1 from ${locationCaptures}
            where ${locationCaptures.sessionId} = ${verificationSessions.id}
          ))`,
          addressChanged: sql<number>`count(*) filter (
            where ${verificationSessions.verificationStatus} in ('ADDRESS_EDITING', 'ADDRESS_PROPOSED')
              or exists (
                select 1
                from ${auditLogs}
                where ${auditLogs.action} = 'ADDRESS_PROPOSED'
                  and ${auditLogs.entityType} = 'ADDRESS'
                  and (${auditLogs.after} ->> 'sessionId') = (${verificationSessions.id}::text)
              )
          )`,
          locationValid: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'LOCATION_VALID')`,
          manualReview: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'MANUAL_REVIEW')`,
          waitingForHome: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'WAITING_FOR_HOME')`,
        })
        .from(verificationCampaignItems)
        .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
        .where(eq(verificationCampaignItems.campaignId, campaignId)),
      db
        .select({
          total: sql<number>`count(*)`,
          scheduled: sql<number>`count(*) filter (where ${reminders.status} = 'SCHEDULED')`,
          sent: sql<number>`count(*) filter (where ${reminders.status} = 'SENT')`,
          failed: sql<number>`count(*) filter (where ${reminders.status} = 'FAILED')`,
          cancelled: sql<number>`count(*) filter (where ${reminders.status} = 'CANCELLED')`,
          opened: sql<number>`count(*) filter (where ${reminders.openedAt} is not null)`,
        })
        .from(reminders)
        .where(campaignSessionFilter),
      db
        .select({ reminderNumber: reminders.reminderNumber, total: sql<number>`count(*)` })
        .from(reminders)
        .where(campaignSessionFilter)
        .groupBy(reminders.reminderNumber),
    ]);
    const reminderByNumber = Object.fromEntries(
      reminderNumberRows.map((row) => [String(row.reminderNumber), Number(row.total ?? 0)]),
    );
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
    const addressChangedExpression = sql<boolean>`
      ${verificationSessions.verificationStatus} in ('ADDRESS_EDITING', 'ADDRESS_PROPOSED')
      or exists (
        select 1 from ${auditLogs}
        where ${auditLogs.action} = 'ADDRESS_PROPOSED'
          and ${auditLogs.entityType} = 'ADDRESS'
          and (${auditLogs.after} ->> 'sessionId') = (${verificationSessions.id}::text)
      )`;
    const gpsReceivedExpression = sql<boolean>`exists (
      select 1 from ${locationCaptures}
      where ${locationCaptures.sessionId} = ${verificationSessions.id}
    )`;
    const locationValidExpression = sql<boolean>`${verificationSessions.verificationStatus} = 'LOCATION_VALID'`;
    const confirmedExpression = sql<boolean>`${verificationSessions.customerConfirmationStatus} = 'CONFIRMED'`;
    const reminderSentCountExpression = sql<number>`(
      select count(*)
      from reminders recipient_reminder
      where recipient_reminder.session_id = ${verificationSessions.id}
        and recipient_reminder.status = 'SENT'
    )`;
    const usesNameCursor = ['customer', 'recipient'].includes(query.sortBy ?? '') && query.sortDirection !== 'desc';
    const usesCursor = !query.sortBy || usesNameCursor;
    const sortDirection = query.sortDirection === 'desc' ? 'desc' : 'asc';
    const sortExpression =
      query.sortBy === 'deliveryStatus'
        ? verificationCampaignItems.status
        : query.sortBy === 'linkStatus'
          ? sql<boolean>`${verificationSessions.openedAt} is not null`
          : query.sortBy === 'addressChanged'
            ? addressChangedExpression
            : query.sortBy === 'gps'
              ? gpsReceivedExpression
              : query.sortBy === 'locationValid'
                ? locationValidExpression
                : query.sortBy === 'confirmed'
                  ? confirmedExpression
                  : query.sortBy === 'reminderCount'
                    ? reminderSentCountExpression
                    : customers.name;
    const nameCursor = usesNameCursor ? decodeCustomerNameCursor(query.cursor) : null;
    const cursor = usesCursor && !usesNameCursor ? decodeListCursor(query.cursor) : undefined;
    const cursorWhere = nameCursor
      ? or(
          gt(customers.name, nameCursor.name),
          and(eq(customers.name, nameCursor.name), gt(verificationCampaignItems.id, nameCursor.id)),
        )
      : cursor
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
        linkOpenedAt: verificationSessions.openedAt,
        confirmationStatus: verificationSessions.customerConfirmationStatus,
        reminderCount: verificationSessions.reminderCount,
        reminderSentCount: sql<number>`(
          select count(*)
          from reminders recipient_reminder
          where recipient_reminder.session_id = ${verificationSessions.id}
            and recipient_reminder.status = 'SENT'
        )`,
        reminderLastSentAt: sql<Date | null>`(
          select max(recipient_reminder.sent_at)
          from reminders recipient_reminder
          where recipient_reminder.session_id = ${verificationSessions.id}
            and recipient_reminder.status = 'SENT'
        )`,
        currentAddressId: verificationSessions.currentAddressId,
        currentAddress: {
          id: customerAddresses.id,
          addressType: customerAddresses.addressType,
          isActive: customerAddresses.isActive,
          isVerified: customerAddresses.isVerified,
          rawAddress: customerAddresses.rawAddress,
          addressReference: customerAddresses.addressReference,
          street: customerAddresses.street,
          houseNumber: customerAddresses.houseNumber,
          rt: customerAddresses.rt,
          rw: customerAddresses.rw,
          building: customerAddresses.building,
          block: customerAddresses.block,
          unit: customerAddresses.unit,
          subdistrict: customerAddresses.subdistrict,
          district: customerAddresses.district,
          city: customerAddresses.city,
          province: customerAddresses.province,
          postalCode: customerAddresses.postalCode,
          addressDetail: customerAddresses.addressDetail,
          landmark: customerAddresses.landmark,
          referenceSource: customerAddresses.referenceSource,
          referencePrecision: customerAddresses.referencePrecision,
        },
        gpsReceived: gpsReceivedExpression,
        addressChanged: addressChangedExpression,
        locationValid: locationValidExpression,
        manualReview: sql<boolean>`${verificationSessions.verificationStatus} = 'MANUAL_REVIEW'`,
      })
      .from(verificationCampaignItems)
      .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
      .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
      .leftJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .where(cursorWhere ? and(...itemFilters, cursorWhere) : and(...itemFilters))
      .orderBy(
        usesNameCursor
          ? asc(customers.name)
          : usesCursor
          ? desc(verificationCampaignItems.createdAt)
          : sortDirection === 'desc'
            ? desc(sortExpression)
            : asc(sortExpression),
        usesNameCursor
          ? asc(verificationCampaignItems.id)
          : usesCursor
          ? desc(verificationCampaignItems.id)
          : sortDirection === 'desc'
            ? desc(verificationCampaignItems.id)
            : asc(verificationCampaignItems.id),
      )
      .offset((usesNameCursor && nameCursor) || (usesCursor && cursor) ? 0 : (query.page - 1) * query.pageSize)
        .limit(query.pageSize);
    const originalAddressIds = [...new Set(items.map((row) => row.item.addressId))];
    const originalAddressRows = originalAddressIds.length
      ? await db.select().from(customerAddresses).where(inArray(customerAddresses.id, originalAddressIds))
      : [];
    const originalAddressById = new Map(originalAddressRows.map((address) => [address.id, address]));
    const itemsWithOriginalAddress = items.map((row) => ({
      ...row,
      originalAddress: originalAddressById.get(row.item.addressId) ?? null,
    }));
    return {
      items: itemsWithOriginalAddress,
      monitoring: {
        ...Object.fromEntries(Object.entries(monitoring ?? {}).map(([key, value]) => [key, Number(value ?? 0)])),
        reminders: {
          ...Object.fromEntries(
            Object.entries(reminderMonitoring ?? {}).map(([key, value]) => [key, Number(value ?? 0)]),
          ),
          byNumber: reminderByNumber,
        },
      },
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        usesNameCursor && items.length === query.pageSize
          ? encodeCustomerNameCursor(items[items.length - 1].customer.name, items[items.length - 1].item.id)
          : usesCursor && items.length === query.pageSize
            ? encodeListCursor(items[items.length - 1].item.createdAt, items[items.length - 1].item.id)
            : null,
      hasMore: items.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
    };
  }

  async materializeNext(campaignId: string) {
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (
      !campaign ||
      campaign.status !== 'RUNNING' ||
      !campaignNeedsMaterialization(campaign.materializationComplete, campaign.materializedCount, campaign.targetCount)
    )
      return { done: true, inserted: 0 };
    const config = await this.validationConfig.get();
    const stored = (
      campaign.targetFilter && typeof campaign.targetFilter === 'object' ? campaign.targetFilter : {}
    ) as StoredTargetFilter;
    const materializationTargetIds = stored.customerIds?.length
      ? selectMaterializationTargetIds(stored.customerIds, campaign.materializationCursor)
      : null;
    const candidateWhere = materializationTargetIds
      ? materializationTargetIds.length
        ? inArray(customers.id, materializationTargetIds)
        : sql`false`
      : filtersForTarget(stored, campaign.materializationCursor ?? undefined);
    const candidateRows = await db
      .select()
      .from(customers)
      .where(candidateWhere)
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
    const initialLinkExpiresAt = new Date(
      Math.max(campaign.scheduledAt.getTime(), now.getTime()) +
        windowMs +
        config.VERIFICATION_TOKEN_TTL_DAYS * 86400000,
    );
    const sessionExpiresAt = verificationSessionExpiresAt(
      initialLinkExpiresAt,
      config.MAX_REMINDERS_PER_SESSION,
      config.REMINDER_LINK_TTL_HOURS,
      config.UNOPENED_LINK_REMINDER_DELAY_DAYS,
      config.UNOPENED_LINK_REMINDER_INTERVAL_DAYS,
    );
    const sessions = targets.map(({ customer, address }) => {
      const id = randomUUID();
      return {
        id,
        campaignId,
        customerId: customer.id,
        currentAddressId: address.id,
        tokenHash: null,
        tokenId: null,
        expiresAt: sessionExpiresAt,
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
