import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import {
  auditLogs,
  coverageChecks,
  customerAddresses,
  customers,
  integrationOutbox,
  ticketingFwaCustomerPoints,
  ticketingMitra,
  validationResults,
  verificationSessions,
} from '../../db/schema/index.js';
import type { RequestAdmin } from '../../common/request-user.js';
import type { TicketingCandidateQueryInput, TicketingCreateInput } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { ValidationConfigService, type RuntimeValidationConfig } from '../../config/validation-config.service.js';
import { latestFwaCoverageValue } from '../coverage/latest-fwa-coverage.sql.js';
import { TicketingAdapter, type TicketingEnvelope } from '../../integrations/ticketing/ticketing.adapter.js';

const timestamp = () => new Date();
const EVENT_TYPE = 'ticket.created.v1';

type TicketingMitraCandidate = { code: string | null; name: string; stations: string[] };
type TicketingMitraMatch = {
  status: 'MATCHED' | 'RECOMMENDED' | 'AMBIGUOUS' | 'FAR' | 'NOT_FOUND' | 'UNAVAILABLE';
  candidates: Array<TicketingMitraCandidate & { distanceMeters: number }>;
};
type TicketingLocationMatch = {
  validatedCoordinates: { latitude: number; longitude: number } | null;
  mitraMatch: TicketingMitraMatch;
};
type TicketingInternalContext = {
  source?: 'ADMIN_MODAL' | 'AUTO_COVERAGE';
  coverageCheckId?: string;
  coordinateMatch?: TicketingLocationMatch;
};

const coveredImportedStatus = (
  column: typeof customers.coverageFwaStatus | typeof customers.coverageFtthStatus,
) => sql`(
  upper(trim(coalesce(${column}, ''))) like 'COVERED%'
  and upper(trim(coalesce(${column}, ''))) not like 'UNCOVERED%'
  and upper(trim(coalesce(${column}, ''))) not like 'NOT COVERED%'
)`;

const stringValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() || fallback : fallback;

const metadataValue = (metadata: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = stringValue(metadata[key]);
    if (value) return value;
  }
  return '';
};

function providerTicketId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const value = response as Record<string, unknown>;
  const nested = value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : null;
  for (const candidate of [
    value.ticket_id,
    value.ticketId,
    value.ticket_number,
    value.ticketNumber,
    value.numberTicket,
    value.id,
    nested?.ticket_id,
    nested?.ticketId,
    nested?.ticket_number,
    nested?.ticketNumber,
    nested?.numberTicket,
    nested?.id,
  ]) {
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  }
  return null;
}

function providerField(response: unknown, field: string): string | null {
  if (!response || typeof response !== 'object') return null;
  const value = response as Record<string, unknown>;
  const nested = value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : null;
  const candidate = value[field] ?? nested?.[field];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : null;
}

@Injectable()
export class TicketingService {
  private readonly adapter = new TicketingAdapter();
  private readonly validationConfig = new ValidationConfigService();

  private async matchMitraByCoordinates(customerIds: string[], autoMatchMaxMeters = 50, recommendationMaxMeters = 300) {
    const locationByCustomer = new Map<string, { latitude: number; longitude: number }>();
    const matches = new Map<string, TicketingLocationMatch>();
    if (!customerIds.length) return matches;

    const validatedRows = await db
      .selectDistinctOn([verificationSessions.customerId], {
        customerId: verificationSessions.customerId,
        latitude: validationResults.capturedLatitude,
        longitude: validationResults.capturedLongitude,
      })
      .from(verificationSessions)
      .innerJoin(
        customerAddresses,
        and(
          eq(customerAddresses.id, verificationSessions.currentAddressId),
          eq(customerAddresses.customerId, verificationSessions.customerId),
          eq(customerAddresses.isActive, true),
          eq(customerAddresses.isVerified, true),
        ),
      )
      .innerJoin(
        validationResults,
        and(
          eq(validationResults.sessionId, verificationSessions.id),
          eq(validationResults.addressId, verificationSessions.currentAddressId),
        ),
      )
      .where(
        and(
          inArray(verificationSessions.customerId, customerIds),
          eq(verificationSessions.verificationStatus, 'LOCATION_VALID'),
        ),
      )
      .orderBy(verificationSessions.customerId, desc(validationResults.createdAt), desc(validationResults.id));
    for (const row of validatedRows) {
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      locationByCustomer.set(row.customerId, {
        latitude,
        longitude,
      });
    }

    const latestChecks = await db
      .selectDistinctOn([coverageChecks.customerId], {
        customerId: coverageChecks.customerId,
        latitude: coverageChecks.latitude,
        longitude: coverageChecks.longitude,
        status: coverageChecks.status,
      })
      .from(coverageChecks)
      .where(and(eq(coverageChecks.providerKey, 'FWA'), inArray(coverageChecks.customerId, customerIds)))
      .orderBy(coverageChecks.customerId, desc(coverageChecks.createdAt), desc(coverageChecks.id));
    for (const check of latestChecks) {
      const latitude = Number(check.latitude);
      const longitude = Number(check.longitude);
      if (
        check.status === 'COVERED' &&
        !locationByCustomer.has(check.customerId) &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      )
        locationByCustomer.set(check.customerId, {
          latitude,
          longitude,
        });
    }
    for (const [customerId, validatedCoordinates] of locationByCustomer)
      matches.set(customerId, {
        validatedCoordinates,
        mitraMatch: { status: 'NOT_FOUND', candidates: [] },
      });
    if (!locationByCustomer.size) return matches;

    try {
      const hasImportedPoints = await db
        .select({ id: ticketingFwaCustomerPoints.id })
        .from(ticketingFwaCustomerPoints)
        .limit(1);
      if (!hasImportedPoints.length) {
        for (const [customerId, current] of matches)
          matches.set(customerId, { ...current, mitraMatch: { status: 'UNAVAILABLE', candidates: [] } });
        return matches;
      }

      const points = sql.join(
        [...locationByCustomer].map(
          ([customerId, coordinates]) =>
            sql`(${customerId}::uuid, ${coordinates.latitude}::double precision, ${coordinates.longitude}::double precision)`,
        ),
        sql`, `,
      );
      const result = await db.execute(sql`
        WITH input_points(customer_id, latitude, longitude) AS (VALUES ${points}), nearest_mitra AS (
          SELECT p.customer_id,
            mitra.source_id AS mitra_source_id,
            mitra.mitra_code,
            mitra.mitra_name,
            mitra.locations,
            min(2 * 6371000 * asin(sqrt(least(1,
              power(sin(radians(fwa.latitude - p.latitude) / 2), 2) +
              cos(radians(p.latitude)) * cos(radians(fwa.latitude)) *
              power(sin(radians(fwa.longitude - p.longitude) / 2), 2)
            )))) AS distance_meters
          FROM input_points p
          JOIN ticketing_fwa_customer_points fwa
            ON fwa.latitude BETWEEN p.latitude - 0.045 AND p.latitude + 0.045
           AND fwa.longitude BETWEEN p.longitude - 0.055 AND p.longitude + 0.055
          JOIN ticketing_mitra mitra
            ON mitra.source_id = fwa.mitra_source_id
           AND mitra.is_active = true
          GROUP BY p.customer_id, mitra.source_id, mitra.mitra_code, mitra.mitra_name, mitra.locations
          HAVING min(2 * 6371000 * asin(sqrt(least(1,
            power(sin(radians(fwa.latitude - p.latitude) / 2), 2) +
            cos(radians(p.latitude)) * cos(radians(fwa.latitude)) *
            power(sin(radians(fwa.longitude - p.longitude) / 2), 2)
          )))) <= 5000
        )
        SELECT customer_id, mitra_source_id, mitra_code, mitra_name, locations, distance_meters
        FROM nearest_mitra
        ORDER BY customer_id, distance_meters
        LIMIT 2000
      `);
      const nearbyByCustomer = new Map<string, Array<TicketingMitraCandidate & { distanceMeters: number }>>();
      for (const row of result.rows as Array<{
        customer_id: string;
        mitra_source_id: string;
        mitra_code: string | null;
        mitra_name: string;
        locations: string[];
        distance_meters: number;
      }>) {
        const candidates = nearbyByCustomer.get(row.customer_id) ?? [];
        candidates.push({
          code: row.mitra_code,
          name: row.mitra_name,
          stations: row.locations,
          distanceMeters: Number(row.distance_meters),
        });
        nearbyByCustomer.set(row.customer_id, candidates);
      }
      for (const [customerId, current] of matches) {
        const nearby = nearbyByCustomer.get(customerId) ?? [];
        const close = nearby.filter((candidate) => candidate.distanceMeters <= autoMatchMaxMeters);
        const recommended = nearby.filter(
          (candidate) =>
            candidate.distanceMeters > autoMatchMaxMeters && candidate.distanceMeters <= recommendationMaxMeters,
        );
        const status =
          close.length > 1
            ? 'AMBIGUOUS'
            : close.length === 1
              ? 'MATCHED'
              : recommended.length
                ? 'RECOMMENDED'
                : nearby.length
                  ? 'FAR'
                  : 'NOT_FOUND';
        const candidates =
          status === 'MATCHED' || status === 'AMBIGUOUS'
            ? close
            : status === 'RECOMMENDED'
              ? recommended
              : nearby.slice(0, 1);
        matches.set(customerId, { ...current, mitraMatch: { status, candidates } });
      }
    } catch {
      for (const [customerId, current] of matches)
        matches.set(customerId, { ...current, mitraMatch: { status: 'UNAVAILABLE', candidates: [] } });
    }
    return matches;
  }

  listMitra() {
    return db
      .select({ code: ticketingMitra.mitraCode, name: ticketingMitra.mitraName, locations: ticketingMitra.locations })
      .from(ticketingMitra)
      .where(eq(ticketingMitra.isActive, true))
      .orderBy(asc(ticketingMitra.mitraName));
  }

  private async ensureConfigured(): Promise<RuntimeValidationConfig> {
    const config = await this.validationConfig.get();
    if (!config.ENABLE_TICKETING)
      throw new DomainError('Ticketing belum diaktifkan. Set ENABLE_TICKETING=true.', 409, 'TICKETING_DISABLED');
    if (!process.env.TICKETING_API_URL || !process.env.TICKETING_API_KEY)
      throw new DomainError('Konfigurasi API Ticketing belum lengkap.', 503, 'TICKETING_NOT_CONFIGURED');
    return config;
  }

  private eligibilitySql() {
    return or(
      coveredImportedStatus(customers.coverageFwaStatus),
      coveredImportedStatus(customers.coverageFtthStatus),
      eq(latestFwaCoverageValue('customer', 'status'), 'COVERED'),
    );
  }

  async listCandidates(query: TicketingCandidateQueryInput) {
    const runtimeConfig = await this.ensureConfigured();
    const filters = [this.eligibilitySql()];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(ilike(customers.name, pattern), ilike(customers.externalId, pattern))!);
    }
    const where = and(...filters);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(customers)
      .where(where);
    const rows = await db
      .select({
        customer: customers,
        latestFwaCoverageStatus: latestFwaCoverageValue('customer', 'status'),
      })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.updatedAt), desc(customers.id))
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    const customerIds = rows.map(({ customer }) => customer.id);
    const addresses = customerIds.length
      ? await db
          .select({ address: customerAddresses })
          .from(customerAddresses)
          .where(and(inArray(customerAddresses.customerId, customerIds), eq(customerAddresses.isActive, true)))
          .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt))
      : [];
    const addressByCustomer = new Map<string, (typeof addresses)[number]['address']>();
    for (const row of addresses)
      if (!addressByCustomer.has(row.address.customerId)) addressByCustomer.set(row.address.customerId, row.address);
    const ticketEvents = customerIds.length
      ? await db
          .select({
            aggregateId: integrationOutbox.aggregateId,
            status: integrationOutbox.status,
            attemptCount: integrationOutbox.attemptCount,
            sentAt: integrationOutbox.sentAt,
            lastError: integrationOutbox.lastError,
            providerTicketId: integrationOutbox.providerTicketId,
            providerResponse: integrationOutbox.providerResponse,
          })
          .from(integrationOutbox)
          .where(and(eq(integrationOutbox.eventType, EVENT_TYPE), inArray(integrationOutbox.aggregateId, customerIds)))
          .orderBy(desc(integrationOutbox.createdAt))
      : [];
    const ticketByCustomer = new Map<string, (typeof ticketEvents)[number]>();
    for (const event of ticketEvents)
      if (!ticketByCustomer.has(event.aggregateId)) ticketByCustomer.set(event.aggregateId, event);
    const locationMatchByCustomer = await this.matchMitraByCoordinates(
      customerIds,
      runtimeConfig.TICKETING_AUTO_MATCH_MAX_METERS,
      runtimeConfig.TICKETING_RECOMMENDATION_MAX_METERS,
    );

    return {
      items: rows.map(({ customer, latestFwaCoverageStatus }) => {
        const event = ticketByCustomer.get(customer.id);
        const address = addressByCustomer.get(customer.id);
        return {
          customerId: customer.id,
          externalId: customer.externalId,
          name: customer.name,
          phoneE164: customer.phoneE164,
          coverageFwaStatus: customer.coverageFwaStatus,
          coverageFtthStatus: customer.coverageFtthStatus,
          latestFwaCoverageStatus,
          address: address
            ? {
                rawAddress: address.rawAddress,
                province: address.province,
                city: address.city,
                district: address.district,
                subdistrict: address.subdistrict,
                postalCode: address.postalCode,
              }
            : null,
          ticketStatus: event?.status ?? 'NOT_CREATED',
          ticketAttemptCount: event?.attemptCount ?? 0,
          ticketSentAt: event?.sentAt ?? null,
          ticketError: event?.status === 'FAILED' ? event.lastError : null,
          providerTicketId: event?.providerTicketId ?? null,
          providerStatus: providerField(event?.providerResponse, 'status'),
          providerStatusForCustomer: providerField(event?.providerResponse, 'status_for_customer'),
          providerResponse: event?.providerResponse ?? null,
          validatedCoordinates: locationMatchByCustomer.get(customer.id)?.validatedCoordinates ?? null,
          mitraMatch: locationMatchByCustomer.get(customer.id)?.mitraMatch ?? {
            status: 'NOT_FOUND',
            candidates: [],
          },
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / query.pageSize),
    };
  }

  async checkProviderStatus(customerId: string) {
    await this.ensureConfigured();
    const [customer] = await db
      .select({ id: customers.id, externalId: customers.externalId })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer tidak ditemukan.');

    const platform = process.env.TICKETING_PLATFORM?.trim() || 'IRA-PREREGIST';
    const platforms = [...new Set([platform, 'IRA-PREREGIST'])];
    let searchedPlatform = platform;
    let body: Record<string, unknown> = {};
    let ticket: Record<string, unknown> | null = null;
    for (const candidatePlatform of platforms) {
      const response = await this.adapter.searchTickets({
        platform: candidatePlatform,
        entityCode: customer.externalId,
      });
      const candidateBody =
        response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {};
      const tickets = Array.isArray(candidateBody.data)
        ? candidateBody.data.filter((candidate): candidate is Record<string, unknown> =>
            Boolean(candidate && typeof candidate === 'object'),
          )
        : [];
      body = candidateBody;
      searchedPlatform = candidatePlatform;
      ticket = tickets[0] ?? null;
      if (ticket) break;
    }

    if (ticket) {
      const [event] = await db
        .select({ id: integrationOutbox.id, sentAt: integrationOutbox.sentAt })
        .from(integrationOutbox)
        .where(and(eq(integrationOutbox.eventType, EVENT_TYPE), eq(integrationOutbox.aggregateId, customer.id)))
        .orderBy(desc(integrationOutbox.createdAt))
        .limit(1);
      if (event) {
        await db
          .update(integrationOutbox)
          .set({
            status: 'PUBLISHED',
            providerTicketId: providerTicketId(ticket),
            providerResponse: ticket,
            sentAt: event.sentAt ?? timestamp(),
            lastError: null,
            updatedAt: timestamp(),
          })
          .where(eq(integrationOutbox.id, event.id));
      }
    }

    return {
      status: ticket ? 'FOUND' : 'NOT_FOUND',
      customerId: customer.id,
      externalId: customer.externalId,
      platform:
        body.filters &&
        typeof body.filters === 'object' &&
        typeof (body.filters as Record<string, unknown>).platform === 'string'
          ? (body.filters as Record<string, unknown>).platform
          : searchedPlatform,
      providerTicketId: ticket ? providerTicketId(ticket) : null,
      providerStatus: ticket ? providerField(ticket, 'status') : null,
      providerStatusForCustomer: ticket ? providerField(ticket, 'status_for_customer') : null,
      providerResponse: ticket,
    };
  }

  async createAutomatically(customerId: string, coverageCheckId: string, currentConfig?: RuntimeValidationConfig) {
    const runtimeConfig = currentConfig ?? (await this.validationConfig.get());
    if (!runtimeConfig.ENABLE_AUTO_TICKETING) return { status: 'DISABLED' as const };
    if (!runtimeConfig.ENABLE_TICKETING) return { status: 'SKIPPED' as const, reason: 'TICKETING_DISABLED' };
    if (!process.env.TICKETING_API_URL?.trim() || !process.env.TICKETING_API_KEY?.trim())
      return { status: 'SKIPPED' as const, reason: 'TICKETING_NOT_CONFIGURED' };

    const coordinateMatch = (
      await this.matchMitraByCoordinates(
        [customerId],
        runtimeConfig.TICKETING_AUTO_MATCH_MAX_METERS,
        runtimeConfig.TICKETING_RECOMMENDATION_MAX_METERS,
      )
    ).get(customerId);
    const closestMitra = coordinateMatch?.mitraMatch.candidates[0];
    if (
      coordinateMatch?.mitraMatch.status !== 'MATCHED' ||
      !closestMitra ||
      closestMitra.distanceMeters > runtimeConfig.TICKETING_AUTO_MATCH_MAX_METERS
    )
      return { status: 'SKIPPED' as const, reason: coordinateMatch?.mitraMatch.status ?? 'COORDINATES_MISSING' };

    const [customer] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) return { status: 'SKIPPED' as const, reason: 'CUSTOMER_NOT_FOUND' };

    return this.create(
      { id: 'system', email: 'system@ira-preregist.local', name: 'Coverage Automation', role: 'ADMIN' },
      {
        customerId,
        payload: {
          title: `Tindak lanjut coverage FWA: ${customer.name}`,
          description:
            'Coverage FWA terkonfirmasi dan lokasi customer telah tervalidasi. Mohon tindak lanjut instalasi.',
          solution: 'Koordinasikan tindak lanjut dan jadwal instalasi layanan FWA dengan customer.',
          error_category: 'instalasi',
          priority: 'LOW',
          severity: 'LOW',
          ticket_type: 'FWA',
          companies: ['SURGE'],
          alert_interval_minutes: 60,
          attachments: [],
        },
        entity: { additional_creator: '-' },
        mitra_data: {
          name: closestMitra.name,
          station: closestMitra.stations.length === 1 ? closestMitra.stations[0] : null,
        },
      },
      { source: 'AUTO_COVERAGE', coverageCheckId, coordinateMatch },
    );
  }

  async create(admin: RequestAdmin, input: TicketingCreateInput, internalContext: TicketingInternalContext = {}) {
    await this.ensureConfigured();
    const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
    if (!customer) throw new NotFoundError('Customer tidak ditemukan.');
    const latestFwaCoverageStatus = await db
      .select({ status: latestFwaCoverageValue('customer', 'status') })
      .from(customers)
      .where(eq(customers.id, customer.id))
      .limit(1);
    const eligible =
      coveredImportedStatusValue(customer.coverageFwaStatus) ||
      coveredImportedStatusValue(customer.coverageFtthStatus) ||
      latestFwaCoverageStatus[0]?.status === 'COVERED';
    if (!eligible) throw new DomainError('Customer belum tercover FWA atau FTTH.', 409, 'TICKETING_NOT_ELIGIBLE');

    const metadata =
      customer.sourceMetadata && typeof customer.sourceMetadata === 'object'
        ? (customer.sourceMetadata as Record<string, unknown>)
        : {};
    const mitraName = stringValue(input.mitra_data?.name, metadataValue(metadata, 'mitra', 'dealer', 'mitra_name'));
    if (!mitraName) throw new DomainError('Nama mitra/dealer wajib diisi.', 400, 'TICKETING_MITRA_REQUIRED');
    const mitraStation = stringValue(input.mitra_data?.station, metadataValue(metadata, 'station')) || null;
    const runtimeConfig = await this.validationConfig.get();
    const coordinateMatch =
      internalContext.coordinateMatch ??
      (
        await this.matchMitraByCoordinates(
          [customer.id],
          runtimeConfig.TICKETING_AUTO_MATCH_MAX_METERS,
          runtimeConfig.TICKETING_RECOMMENDATION_MAX_METERS,
        )
      ).get(customer.id) ??
      null;
    const internalMetadata = {
      source: internalContext.source ?? 'ADMIN_MODAL',
      coverageCheckId: internalContext.coverageCheckId ?? null,
      validatedCoordinates: coordinateMatch?.validatedCoordinates ?? null,
      fwaMitraMatch: coordinateMatch?.mitraMatch ?? null,
      selectedMitra: { name: mitraName, station: mitraStation },
    };
    const envelope: TicketingEnvelope = {
      platform: process.env.TICKETING_PLATFORM?.trim() || 'IRA-PREREGIST',
      payload: input.payload,
      entity: {
        entity_kind: 'Customer',
        entity_email: input.entity?.entity_email ?? metadataValue(metadata, 'email', 'entity_email'),
        entity_code: customer.externalId,
        entity_name: customer.name,
        entity_phone: customer.phoneE164,
        hardware_serial_number: '',
        additional_creator:
          input.entity?.additional_creator ??
          metadataValue(metadata, 'additional_creator', 'additionalCreator', 'creator', '-'),
      },
      osp_data: null,
      mitra_data: { name: mitraName, station: mitraStation },
    };
    const idempotencyKey = `ticketing:${customer.id}`;
    const [existing] = await db
      .select()
      .from(integrationOutbox)
      .where(and(eq(integrationOutbox.eventType, EVENT_TYPE), eq(integrationOutbox.aggregateId, customer.id)))
      .orderBy(desc(integrationOutbox.createdAt))
      .limit(1);
    if (existing?.status === 'PUBLISHED') {
      if (!existing.internalMetadata)
        await db.update(integrationOutbox).set({ internalMetadata }).where(eq(integrationOutbox.id, existing.id));
      return {
        status: 'ALREADY_CREATED',
        customerId: customer.id,
        eventId: existing.eventId,
        providerTicketId: existing.providerTicketId,
        providerResponse: existing.providerResponse,
      };
    }
    if (existing && (existing.status === 'PENDING' || existing.status === 'PROCESSING'))
      throw new DomainError('Ticket customer ini sedang diproses.', 409, 'TICKETING_IN_PROGRESS');

    let eventId = existing?.eventId ?? randomUUID();
    if (existing) {
      await db
        .update(integrationOutbox)
        .set({
          payload: envelope,
          internalMetadata,
          status: 'PROCESSING',
          attemptCount: existing.attemptCount + 1,
          lastError: null,
          updatedAt: timestamp(),
        })
        .where(eq(integrationOutbox.id, existing.id));
    } else {
      const [created] = await db
        .insert(integrationOutbox)
        .values({
          eventId,
          eventType: EVENT_TYPE,
          aggregateType: 'CUSTOMER',
          aggregateId: customer.id,
          correlationId: randomUUID(),
          idempotencyKey,
          payload: envelope,
          internalMetadata,
          status: 'PROCESSING',
          attemptCount: 1,
          createdAt: timestamp(),
          updatedAt: timestamp(),
        })
        .onConflictDoNothing({ target: integrationOutbox.idempotencyKey })
        .returning({ id: integrationOutbox.id, eventId: integrationOutbox.eventId });
      if (!created)
        throw new DomainError(
          'Ticket customer ini sedang diproses atau sudah dibuat.',
          409,
          'TICKETING_ALREADY_PROCESSING',
        );
      eventId = created.eventId;
    }

    try {
      const providerResponse = await this.adapter.createTicket(envelope);
      await db
        .update(integrationOutbox)
        .set({
          status: 'PUBLISHED',
          providerTicketId: providerTicketId(providerResponse),
          providerResponse: providerResponse as Record<string, unknown>,
          sentAt: timestamp(),
          lastError: null,
          updatedAt: timestamp(),
        })
        .where(and(eq(integrationOutbox.eventType, EVENT_TYPE), eq(integrationOutbox.aggregateId, customer.id)));
      await db.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'TICKET_CREATED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        after: envelope,
        reason: internalContext.source === 'AUTO_COVERAGE' ? 'Auto coverage FWA' : 'Ticketing API',
        timestamp: timestamp(),
      });
      return {
        status: 'CREATED',
        customerId: customer.id,
        eventId,
        providerTicketId: providerTicketId(providerResponse),
        providerResponse,
      };
    } catch (error) {
      await db
        .update(integrationOutbox)
        .set({
          status: 'FAILED',
          lastError: error instanceof Error ? error.message : String(error),
          updatedAt: timestamp(),
        })
        .where(and(eq(integrationOutbox.eventType, EVENT_TYPE), eq(integrationOutbox.aggregateId, customer.id)));
      throw new DomainError(
        error instanceof Error ? error.message : 'Ticketing provider gagal.',
        502,
        'TICKETING_PROVIDER_ERROR',
      );
    }
  }
}

function coveredImportedStatusValue(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase() ?? '';
  return (
    normalized.startsWith('COVERED') && !normalized.startsWith('UNCOVERED') && !normalized.startsWith('NOT COVERED')
  );
}
