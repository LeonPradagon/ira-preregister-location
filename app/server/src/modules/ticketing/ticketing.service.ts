import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { auditLogs, customerAddresses, customers, integrationOutbox } from '../../db/schema/index.js';
import type { RequestAdmin } from '../../common/request-user.js';
import type { TicketingCandidateQueryInput, TicketingCreateInput } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { latestFwaCoverageValue } from '../coverage/latest-fwa-coverage.sql.js';
import { TicketingAdapter, type TicketingEnvelope } from '../../integrations/ticketing/ticketing.adapter.js';

const timestamp = () => new Date();
const EVENT_TYPE = 'ticket.created.v1';

const coveredImportedStatus = (column: typeof customers.coverageFwaStatus | typeof customers.coverageFtthStatus) => sql`(
  upper(trim(coalesce(${column}, ''))) like 'COVERED%'
  and upper(trim(coalesce(${column}, ''))) not like 'UNCOVERED%'
  and upper(trim(coalesce(${column}, ''))) not like 'NOT COVERED%'
)`;

const stringValue = (value: unknown, fallback = '') => (typeof value === 'string' ? value.trim() || fallback : fallback);

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
  const nested = value.data && typeof value.data === 'object' ? value.data as Record<string, unknown> : null;
  for (const candidate of [value.ticket_id, value.ticketId, value.ticket_number, value.ticketNumber, value.numberTicket, value.id, nested?.ticket_id, nested?.ticketId, nested?.ticket_number, nested?.ticketNumber, nested?.numberTicket, nested?.id]) {
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  }
  return null;
}

function providerField(response: unknown, field: string): string | null {
  if (!response || typeof response !== 'object') return null;
  const value = response as Record<string, unknown>;
  const nested = value.data && typeof value.data === 'object' ? value.data as Record<string, unknown> : null;
  const candidate = value[field] ?? nested?.[field];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : null;
}

@Injectable()
export class TicketingService {
  private readonly adapter = new TicketingAdapter();

  private ensureConfigured() {
    if (process.env.ENABLE_TICKETING !== 'true')
      throw new DomainError('Ticketing belum diaktifkan. Set ENABLE_TICKETING=true.', 409, 'TICKETING_DISABLED');
    if (!process.env.TICKETING_API_URL || !process.env.TICKETING_API_KEY)
      throw new DomainError('Konfigurasi API Ticketing belum lengkap.', 503, 'TICKETING_NOT_CONFIGURED');
  }

  private eligibilitySql() {
    return or(
      coveredImportedStatus(customers.coverageFwaStatus),
      coveredImportedStatus(customers.coverageFtthStatus),
      eq(latestFwaCoverageValue('customer', 'status'), 'COVERED'),
    );
  }

  async listCandidates(query: TicketingCandidateQueryInput) {
    this.ensureConfigured();
    const filters = [this.eligibilitySql()];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(ilike(customers.name, pattern), ilike(customers.externalId, pattern))!);
    }
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(customers).where(where);
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
    for (const row of addresses) if (!addressByCustomer.has(row.address.customerId)) addressByCustomer.set(row.address.customerId, row.address);
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
    for (const event of ticketEvents) if (!ticketByCustomer.has(event.aggregateId)) ticketByCustomer.set(event.aggregateId, event);

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
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / query.pageSize),
    };
  }

  async checkProviderStatus(customerId: string) {
    this.ensureConfigured();
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
      const response = await this.adapter.searchTickets({ platform: candidatePlatform, entityCode: customer.externalId });
      const candidateBody = response.data && typeof response.data === 'object'
        ? response.data as Record<string, unknown>
        : {};
      const tickets = Array.isArray(candidateBody.data)
        ? candidateBody.data.filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && typeof candidate === 'object'))
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
      platform: body.filters && typeof body.filters === 'object' && typeof (body.filters as Record<string, unknown>).platform === 'string'
        ? (body.filters as Record<string, unknown>).platform
        : searchedPlatform,
      providerTicketId: ticket ? providerTicketId(ticket) : null,
      providerStatus: ticket ? providerField(ticket, 'status') : null,
      providerStatusForCustomer: ticket ? providerField(ticket, 'status_for_customer') : null,
      providerResponse: ticket,
    };
  }

  async create(admin: RequestAdmin, input: TicketingCreateInput) {
    this.ensureConfigured();
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

    const metadata = customer.sourceMetadata && typeof customer.sourceMetadata === 'object' ? customer.sourceMetadata as Record<string, unknown> : {};
    const mitraName = stringValue(input.mitra_data?.name, metadataValue(metadata, 'mitra', 'dealer', 'mitra_name'));
    if (!mitraName) throw new DomainError('Nama mitra/dealer wajib diisi.', 400, 'TICKETING_MITRA_REQUIRED');
    const mitraStation = stringValue(input.mitra_data?.station, metadataValue(metadata, 'station')) || null;
    const envelope: TicketingEnvelope = {
      platform: process.env.TICKETING_PLATFORM?.trim() || 'IRA-PREREGIST',
      payload: input.payload,
      entity: {
        entity_kind: 'Customer',
        entity_email: input.entity?.entity_email ?? metadataValue(metadata, 'email', 'entity_email'),
        entity_code: customer.externalId,
        entity_name: customer.name,
        entity_phone: customer.phoneE164,
        hardware_serial_number:
          input.entity?.hardware_serial_number ??
          metadataValue(metadata, 'hardware_serial_number', 'hardwareSerialNumber', 'serial_number', 'serialNumber'),
        additional_creator: input.entity?.additional_creator ?? metadataValue(metadata, 'additional_creator', 'additionalCreator', 'creator', '-'),
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
    if (existing?.status === 'PUBLISHED')
      return {
        status: 'ALREADY_CREATED',
        customerId: customer.id,
        eventId: existing.eventId,
        providerTicketId: existing.providerTicketId,
        providerResponse: existing.providerResponse,
      };
    if (existing && (existing.status === 'PENDING' || existing.status === 'PROCESSING'))
      throw new DomainError('Ticket customer ini sedang diproses.', 409, 'TICKETING_IN_PROGRESS');

    let eventId = existing?.eventId ?? randomUUID();
    if (existing) {
      await db
        .update(integrationOutbox)
        .set({ payload: envelope, status: 'PROCESSING', attemptCount: existing.attemptCount + 1, lastError: null, updatedAt: timestamp() })
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
          status: 'PROCESSING',
          attemptCount: 1,
          createdAt: timestamp(),
          updatedAt: timestamp(),
        })
        .onConflictDoNothing({ target: integrationOutbox.idempotencyKey })
        .returning({ id: integrationOutbox.id, eventId: integrationOutbox.eventId });
      if (!created) throw new DomainError('Ticket customer ini sedang diproses atau sudah dibuat.', 409, 'TICKETING_ALREADY_PROCESSING');
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
        reason: 'Ticketing API',
        timestamp: timestamp(),
      });
      return { status: 'CREATED', customerId: customer.id, eventId, providerTicketId: providerTicketId(providerResponse), providerResponse };
    } catch (error) {
      await db
        .update(integrationOutbox)
        .set({ status: 'FAILED', lastError: error instanceof Error ? error.message : String(error), updatedAt: timestamp() })
        .where(and(eq(integrationOutbox.eventType, EVENT_TYPE), eq(integrationOutbox.aggregateId, customer.id)));
      throw new DomainError(error instanceof Error ? error.message : 'Ticketing provider gagal.', 502, 'TICKETING_PROVIDER_ERROR');
    }
  }
}

function coveredImportedStatusValue(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized.startsWith('COVERED') && !normalized.startsWith('UNCOVERED') && !normalized.startsWith('NOT COVERED');
}
