import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, customerAddresses, customers, integrationConfigs, integrationOutbox, locationCaptures, reminders, validationResults, verificationReviews, verificationSessions, whatsappDeliveryLogs } from '../../db/schema/index.js';
import { AddressChangeInput, AdminListQueryInput, CustomerCreateInput, CustomerListQueryInput, CustomerUpdateInput, ReviewInput, ValidationConfigInput } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { RequestAdmin } from '../../common/request-user.js';
import { WhatsAppPort } from '../../integrations/whatsapp/whatsapp.port.js';
import { assertTransition } from '../verification/state-machine.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';
import { hashPhone, nextAllowedSendAt } from '../../integrations/whatsapp/whatsapp.policy.js';
import { createVerificationToken } from '../verification/verification-token.js';
const timestamp = () => new Date();
const canManage = (role: RequestAdmin['role']) => role === 'SUPER_ADMIN' || role === 'ADMIN';

function formatRawAddress(address: CustomerCreateInput['address']) {
  return [
    address.street,
    `No. ${address.houseNumber}`,
    address.block && `Blok ${address.block}`,
    address.subdistrict,
    address.district,
    address.city,
    address.province,
    address.postalCode,
  ].filter(Boolean).join(', ');
}

function sanitizeSession(session: typeof verificationSessions.$inferSelect) {
  const { tokenId: _tokenId, tokenHash: _tokenHash, ...safeSession } = session;
  return safeSession;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(WhatsAppPort) private readonly whatsapp: WhatsAppPort,
    private readonly validationConfig: ValidationConfigService,
  ) {}

  async me(admin: RequestAdmin) {
    return admin;
  }

  async dashboard() {
    const [customerStats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${customers.status} = 'ACTIVE')`,
      verified: sql<number>`count(*) filter (where ${customers.status} = 'VERIFIED')`,
      whatsappOptedIn: sql<number>`count(*) filter (where ${customers.whatsappOptInAt} is not null and ${customers.whatsappOptOutAt} is null)`,
      whatsappOptedOut: sql<number>`count(*) filter (where ${customers.whatsappOptOutAt} is not null)`,
    }).from(customers);

    const [verificationStats] = await db.select({
      total: sql<number>`count(*)`,
      invitationsSent: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} <> 'CREATED')`,
      linksOpened: sql<number>`count(*) filter (where ${verificationSessions.openedAt} is not null)`,
      customersConfirmed: sql<number>`count(*) filter (where ${verificationSessions.customerConfirmationStatus} = 'CONFIRMED')`,
      customersMismatch: sql<number>`count(*) filter (where ${verificationSessions.customerConfirmationStatus} = 'MISMATCH')`,
      gpsCaptured: sql<number>`count(*) filter (where ${verificationSessions.attemptCount} > 0)`,
      lowGpsAccuracy: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'LOW_GPS_ACCURACY')`,
      waitingForHome: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'WAITING_FOR_HOME')`,
      addressChanged: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} in ('ADDRESS_EDITING', 'ADDRESS_PROPOSED'))`,
      manualReview: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'MANUAL_REVIEW')`,
      locationValid: sql<number>`count(*) filter (where ${verificationSessions.verificationStatus} = 'LOCATION_VALID')`,
    }).from(verificationSessions);

    const [reminderStats, outboxStats, verificationStatusRows, reminderNumberRows] = await Promise.all([
      db.select({
        total: sql<number>`count(*)`,
        scheduled: sql<number>`count(*) filter (where ${reminders.status} = 'SCHEDULED')`,
        sent: sql<number>`count(*) filter (where ${reminders.status} = 'SENT')`,
        failed: sql<number>`count(*) filter (where ${reminders.status} = 'FAILED')`,
        cancelled: sql<number>`count(*) filter (where ${reminders.status} = 'CANCELLED')`,
      }).from(reminders),
      db.select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${integrationOutbox.status} = 'PENDING')`,
        published: sql<number>`count(*) filter (where ${integrationOutbox.status} = 'PUBLISHED')`,
        failed: sql<number>`count(*) filter (where ${integrationOutbox.status} = 'FAILED')`,
      }).from(integrationOutbox),
      db.select({ status: verificationSessions.verificationStatus, total: sql<number>`count(*)` }).from(verificationSessions).groupBy(verificationSessions.verificationStatus),
      db.select({ reminderNumber: reminders.reminderNumber, total: sql<number>`count(*) filter (where ${reminders.status} = 'SENT')` }).from(reminders).groupBy(reminders.reminderNumber),
    ]);

    const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);
    const statusCounts = Object.fromEntries(verificationStatusRows.map((row) => [row.status, toNumber(row.total)]));
    const byNumber = Object.fromEntries(reminderNumberRows.map((row) => [String(row.reminderNumber), toNumber(row.total)]));

    return {
      generatedAt: new Date().toISOString(),
      customers: Object.fromEntries(Object.entries(customerStats).map(([key, value]) => [key, toNumber(value)])),
      verifications: {
        ...Object.fromEntries(Object.entries(verificationStats).map(([key, value]) => [key, toNumber(value)])),
        statusCounts,
      },
      reminders: {
        ...Object.fromEntries(Object.entries(reminderStats[0]).map(([key, value]) => [key, toNumber(value)])),
        byNumber,
      },
      outbox: Object.fromEntries(Object.entries(outboxStats[0]).map(([key, value]) => [key, toNumber(value)])),
    };
  }

  async listCustomers(query: CustomerListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(ilike(customers.name, pattern), ilike(customers.externalId, pattern), ilike(customers.phoneE164, pattern), ilike(customers.sourceRecordId, pattern)));
    }
    if (query.status) filters.push(eq(customers.status, query.status));
    if (query.locationStatus === 'UNVERIFIED') {
      filters.push(ne(customers.status, 'SUSPENDED'), isNull(customers.whatsappOptOutAt), sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = false)`);
    } else if (query.locationStatus === 'VERIFIED') {
      filters.push(sql`exists (select 1 from customer_addresses campaign_address where campaign_address.customer_id = ${customers.id} and campaign_address.is_active = true and campaign_address.is_verified = true)`);
    }
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(customers).where(where);
    const customerRows = query.cursor
      ? await db.select().from(customers).where(and(where, gt(customers.id, query.cursor))).orderBy(asc(customers.id)).limit(query.pageSize)
      : await db.select().from(customers).where(where).orderBy(desc(customers.updatedAt), desc(customers.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const customerIds = customerRows.map((customer) => customer.id);
    if (!customerIds.length) return { items: [], page: query.page, pageSize: query.pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / query.pageSize), nextCursor: null };

    const addressRows = await db.select({
      address: customerAddresses,
      referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
      referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
    }).from(customerAddresses).where(and(inArray(customerAddresses.customerId, customerIds), eq(customerAddresses.isActive, true)));
    const sessionRows = await db.select().from(verificationSessions).where(inArray(verificationSessions.customerId, customerIds)).orderBy(desc(verificationSessions.updatedAt));
    const addressByCustomer = new Map<string, Record<string, unknown>>();
    for (const row of addressRows) if (!addressByCustomer.has(row.address.customerId)) addressByCustomer.set(row.address.customerId, {
      ...row.address,
      referenceLocation: row.referenceLatitude == null || row.referenceLongitude == null ? null : { latitude: Number(row.referenceLatitude), longitude: Number(row.referenceLongitude) },
    });
    const sessionByCustomer = new Map<string, typeof sessionRows[number]>();
    for (const session of sessionRows) if (!sessionByCustomer.has(session.customerId)) sessionByCustomer.set(session.customerId, session);
    return {
      items: customerRows.map((customer) => ({ ...customer, activeAddress: addressByCustomer.get(customer.id) ?? null, latestVerification: sessionByCustomer.get(customer.id) ? sanitizeSession(sessionByCustomer.get(customer.id)!) : null })),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / query.pageSize),
      nextCursor: query.cursor ? customerRows[customerRows.length - 1]?.id ?? null : null,
    };
  }

  async createCustomer(admin: RequestAdmin, input: CustomerCreateInput) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a customer', 403, 'FORBIDDEN');
    const created = timestamp();
    const customerId = randomUUID();
    const addressId = randomUUID();
    const address = input.address;
    const rawAddress = formatRawAddress(address);

    const result = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({
        id: customerId,
        externalId: input.externalId,
        name: input.name,
        phoneE164: input.phoneE164,
        whatsappOptInAt: input.whatsappOptInAt ? new Date(input.whatsappOptInAt) : null,
        whatsappOptInSource: input.whatsappOptInSource ?? null,
        status: input.status,
        createdAt: created,
        updatedAt: created,
      }).returning();
      const [createdAddress] = await tx.insert(customerAddresses).values({
        id: addressId,
        customerId,
        addressType: 'MASTER',
        addressStatus: 'ACTIVE',
        rawAddress,
        province: address.province,
        city: address.city,
        district: address.district,
        subdistrict: address.subdistrict,
        postalCode: address.postalCode,
        street: address.street,
        houseNumber: address.houseNumber,
        rt: address.rt,
        rw: address.rw,
        building: address.building,
        block: address.block,
        unit: address.unit,
        addressDetail: address.addressDetail,
        landmark: address.landmark,
        referenceLocation: address.referenceLocation,
        referenceSource: address.referenceSource,
        referencePrecision: address.referencePrecision,
        referenceConfidence: address.referenceConfidence.toFixed(3),
        isActive: true,
        isVerified: false,
        validFrom: created,
        createdAt: created,
        updatedAt: created,
      }).returning();
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_CREATED',
        entityType: 'CUSTOMER',
        entityId: customerId,
        after: { customerId, addressId, externalId: input.externalId },
        timestamp: created,
      });
      return { customer, address: createdAddress };
    });
    return { ...result, address: { ...result.address, referenceLocation: address.referenceLocation } };
  }

  async customer(id: string) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) throw new NotFoundError('Customer not found');
    const addressRows = await db.select({
      address: customerAddresses,
      referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
      referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
    }).from(customerAddresses).where(eq(customerAddresses.customerId, id));
    const addresses = addressRows.map(({ address, referenceLatitude, referenceLongitude }) => ({
      ...address,
      referenceLocation: referenceLatitude == null || referenceLongitude == null
        ? null
        : { latitude: Number(referenceLatitude), longitude: Number(referenceLongitude) },
    }));
    const sessions = await db.select().from(verificationSessions).where(eq(verificationSessions.customerId, id)).orderBy(desc(verificationSessions.createdAt));
    return { customer, addresses, sessions: sessions.map(sanitizeSession) };
  }

  async updateCustomer(admin: RequestAdmin, id: string, input: CustomerUpdateInput) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot update a customer', 403, 'FORBIDDEN');
    const [existing] = await db.select().from(customers).where(eq(customers.id, id));
    if (!existing) throw new NotFoundError('Customer not found');
    const [activeAddress] = await db.select().from(customerAddresses).where(and(eq(customerAddresses.customerId, id), eq(customerAddresses.isActive, true))).orderBy(desc(customerAddresses.updatedAt)).limit(1);
    const updatedAt = timestamp();

    const result = await db.transaction(async (tx) => {
      const [customer] = await tx.update(customers).set({
        externalId: input.externalId ?? existing.externalId,
        name: input.name ?? existing.name,
        phoneE164: input.phoneE164 ?? existing.phoneE164,
        whatsappOptInAt: input.whatsappOptInAt === undefined ? existing.whatsappOptInAt : input.whatsappOptInAt ? new Date(input.whatsappOptInAt) : null,
        whatsappOptInSource: input.whatsappOptInSource === undefined ? existing.whatsappOptInSource : input.whatsappOptInSource,
        status: input.status ?? existing.status,
        updatedAt,
      }).where(eq(customers.id, id)).returning();

      let address = activeAddress;
      if (input.address && activeAddress) {
        const nextAddress = input.address;
        [address] = await tx.update(customerAddresses).set({
          addressStatus: 'ACTIVE',
          addressType: 'MASTER',
          rawAddress: formatRawAddress(nextAddress),
          province: nextAddress.province,
          city: nextAddress.city,
          district: nextAddress.district,
          subdistrict: nextAddress.subdistrict,
          postalCode: nextAddress.postalCode,
          street: nextAddress.street,
          houseNumber: nextAddress.houseNumber,
          rt: nextAddress.rt,
          rw: nextAddress.rw,
          building: nextAddress.building,
          block: nextAddress.block,
          unit: nextAddress.unit,
          addressDetail: nextAddress.addressDetail,
          landmark: nextAddress.landmark,
          referenceLocation: nextAddress.referenceLocation,
          referenceSource: nextAddress.referenceSource,
          referencePrecision: nextAddress.referencePrecision,
          referenceConfidence: nextAddress.referenceConfidence.toFixed(3),
          isVerified: false,
          validTo: null,
          updatedAt,
        }).where(eq(customerAddresses.id, activeAddress.id)).returning();
      }
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_UPDATED',
        entityType: 'CUSTOMER',
        entityId: id,
        before: { externalId: existing.externalId, name: existing.name, phoneE164: existing.phoneE164, status: existing.status },
        after: { externalId: customer.externalId, name: customer.name, phoneE164: customer.phoneE164, status: customer.status, addressUpdated: Boolean(input.address) },
        timestamp: updatedAt,
      });
      return { customer, address };
    });

    return result;
  }

  async deleteCustomer(admin: RequestAdmin, id: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot delete a customer', 403, 'FORBIDDEN');
    const [existing] = await db.select().from(customers).where(eq(customers.id, id));
    if (!existing) throw new NotFoundError('Customer not found');
    const updatedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx.update(customers).set({ status: 'SUSPENDED', updatedAt }).where(eq(customers.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_DEACTIVATED',
        entityType: 'CUSTOMER',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'SUSPENDED' },
        reason: 'Soft delete dari panel admin',
        timestamp: updatedAt,
      });
    });
    return { id, status: 'SUSPENDED' as const };
  }

  async createVerification(admin: RequestAdmin, customerId: string, addressId: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a verification session', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [address] = await db.select().from(customerAddresses).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId), eq(customerAddresses.isActive, true)));
    if (!customer || !address) throw new NotFoundError('Customer or active address not found');
    if (customer.whatsappOptOutAt) throw new DomainError('Customer has opted out of WhatsApp messages', 422, 'CUSTOMER_OPTED_OUT');
    await this.assertManualSendAllowed(customer.phoneE164);
    const verificationToken = await createVerificationToken();
    const created = timestamp();
    const [session] = await db.insert(verificationSessions).values({
      id: randomUUID(), customerId, currentAddressId: addressId, tokenId: verificationToken.tokenId, tokenHash: verificationToken.tokenHash,
      expiresAt: new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000),
      verificationStatus: 'CREATED', customerConfirmationStatus: 'UNCONFIRMED', registeredPhoneSnapshot: customer.phoneE164,
      createdAt: created, updatedAt: created,
    }).returning();
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
    await this.whatsapp.send({ phoneE164: customer.phoneE164, templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? 'location_verification', templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'id', templateParameters: [customer.name, verificationLink], idempotencyKey: `invitation:${session.id}` });
    await this.recordManualDelivery(customer.phoneE164, `invitation:${session.id}`, 'CAMPAIGN_INVITATION');
    await db.update(verificationSessions).set({ verificationStatus: 'MESSAGE_SENT', updatedAt: timestamp() }).where(eq(verificationSessions.id, session.id));
    await db.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'VERIFICATION_CREATED', entityType: 'VERIFICATION_SESSION', entityId: session.id, after: { customerId, addressId, tokenStoredAsHash: true }, timestamp: created });
    return { sessionId: session.id, verificationLink, expiresAt: session.expiresAt };
  }

  async verifications(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(sql`${verificationSessions.id}::text ilike ${pattern}`, ilike(customers.name, pattern), ilike(customers.externalId, pattern), ilike(verificationSessions.registeredPhoneSnapshot, pattern)));
    }
    if (query.status) filters.push(eq(verificationSessions.verificationStatus, query.status as typeof verificationSessions.$inferSelect.verificationStatus));
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(verificationSessions).innerJoin(customers, eq(customers.id, verificationSessions.customerId)).where(where);
    const rows = await db.select({ session: verificationSessions, customer: customers }).from(verificationSessions).innerJoin(customers, eq(customers.id, verificationSessions.customerId)).where(where).orderBy(desc(verificationSessions.updatedAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return { items: rows.map(({ session, customer }) => ({ session: sanitizeSession(session), customer })), page: query.page, pageSize: query.pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / query.pageSize) };
  }

  async verification(id: string) {
    const [row] = await db.select({
      session: verificationSessions,
      customer: customers,
      address: customerAddresses,
      referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
      referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
    }).from(verificationSessions).innerJoin(customers, eq(customers.id, verificationSessions.customerId)).innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId)).where(eq(verificationSessions.id, id));
    if (!row) throw new NotFoundError('Verification session not found');
    const address = {
      ...row.address,
      referenceLocation: row.referenceLatitude == null || row.referenceLongitude == null
        ? null
        : { latitude: Number(row.referenceLatitude), longitude: Number(row.referenceLongitude) },
    };
    const [results, reviews, sessionReminders, audits, captures] = await Promise.all([
      db.select().from(validationResults).where(eq(validationResults.sessionId, id)).orderBy(desc(validationResults.createdAt)),
      db.select().from(verificationReviews).where(eq(verificationReviews.sessionId, id)).orderBy(desc(verificationReviews.createdAt)),
      db.select().from(reminders).where(eq(reminders.sessionId, id)).orderBy(desc(reminders.createdAt)),
      db.select().from(auditLogs).where(sql`${auditLogs.entityId} = ${id}`).orderBy(desc(auditLogs.timestamp)),
      db.select().from(locationCaptures).where(eq(locationCaptures.sessionId, id)).orderBy(desc(locationCaptures.createdAt)),
    ]);
    return { session: sanitizeSession(row.session), customer: row.customer, address, results, reviews, reminders: sessionReminders, audits, captures };
  }

  async resend(admin: RequestAdmin, id: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot resend verification', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    const detail = await this.verification(id);
    if (detail.session.revokedAt || detail.session.expiresAt <= timestamp()) throw new DomainError('Session is expired or revoked', 409, 'SESSION_EXPIRED');
    if (detail.session.verificationStatus === 'LOCATION_VALID') throw new DomainError('Verified sessions cannot be resent', 409, 'SESSION_COMPLETED');
    if (detail.customer.whatsappOptOutAt) throw new DomainError('Customer has opted out of WhatsApp messages', 422, 'CUSTOMER_OPTED_OUT');
    await this.assertManualSendAllowed(detail.customer.phoneE164);
    const verificationToken = await createVerificationToken();
    const expiresAt = new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000);
    const updatedAt = timestamp();
    await db.update(verificationSessions).set({ tokenId: verificationToken.tokenId, tokenHash: verificationToken.tokenHash, expiresAt, updatedAt }).where(eq(verificationSessions.id, id));
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
    const idempotencyKey = `invitation-resend:${id}:${verificationToken.tokenId}`;
    await this.whatsapp.send({ phoneE164: detail.customer.phoneE164, templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? 'location_verification', templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'id', templateParameters: [detail.customer.name, verificationLink], idempotencyKey });
    await this.recordManualDelivery(detail.customer.phoneE164, idempotencyKey, 'INVITATION_RESEND');
    await db.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'INVITATION_RESENT', entityType: 'VERIFICATION_SESSION', entityId: id, after: { tokenRotated: true, tokenStoredAsHash: true, expiresAt: expiresAt.toISOString() }, timestamp: updatedAt });
    return { status: 'SENT', verificationLink, expiresAt };
  }

  async revoke(admin: RequestAdmin, id: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot revoke verification', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    assertTransition(detail.session.verificationStatus, 'EXPIRED');
    const revokedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx.update(verificationSessions).set({ revokedAt, verificationStatus: 'EXPIRED', updatedAt: revokedAt }).where(eq(verificationSessions.id, id));
      await tx.update(reminders).set({ status: 'CANCELLED' }).where(and(eq(reminders.sessionId, id), eq(reminders.status, 'SCHEDULED')));
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'VERIFICATION_REVOKED',
        entityType: 'VERIFICATION_SESSION',
        entityId: id,
        before: { status: detail.session.verificationStatus },
        after: { status: 'EXPIRED', revokedAt: revokedAt.toISOString() },
        timestamp: revokedAt,
      });
    });
    return { status: 'EXPIRED' };
  }

  async sendManualReminder(admin: RequestAdmin, id: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot send a reminder', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    const config = await this.validationConfig.get();
    const max = config.MAX_REMINDERS_PER_SESSION;
    if (!config.ENABLE_REMINDERS) throw new DomainError('Reminders are disabled', 409, 'REMINDERS_DISABLED');
    const reminderNumber = detail.session.reminderCount + 1;
    if (detail.session.revokedAt || detail.session.expiresAt <= timestamp()) throw new DomainError('Session is expired or revoked', 409, 'SESSION_EXPIRED');
    if (detail.session.verificationStatus === 'LOCATION_VALID' || detail.session.verificationStatus === 'EXPIRED') throw new DomainError('Completed sessions cannot receive reminders', 409, 'SESSION_COMPLETED');
    if (reminderNumber > max) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');

    const scheduledAt = timestamp();
    const nextStatus = reminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME';
    assertTransition(detail.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx.update(verificationSessions).set({ reminderCount: reminderNumber, verificationStatus: nextStatus, updatedAt: scheduledAt }).where(eq(verificationSessions.id, id));
      await tx.insert(reminders).values({
        id: randomUUID(),
        sessionId: id,
        reminderNumber,
        channel: 'WHATSAPP',
        scheduledAt,
        status: 'SCHEDULED',
        messageText: `Halo ${detail.customer.name}, ini pengingat verifikasi lokasi Anda. Pengingat ${reminderNumber} dari ${max}. Tautan dibuat saat pengiriman.`,
        retryCount: 0,
        createdAt: scheduledAt,
      });
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'REMINDER_SCHEDULED',
        entityType: 'REMINDER',
        entityId: id,
        after: { reminderNumber, manual: true, tokenRotated: true },
        timestamp: scheduledAt,
      });
    });
    return { status: 'SCHEDULED', reminderNumber };
  }

  async review(admin: RequestAdmin, id: string, input: ReviewInput) {
    if (!['SUPER_ADMIN', 'ADMIN', 'REVIEWER'].includes(admin.role)) throw new DomainError('Role cannot perform manual review', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    const nextStatus = input.decision === 'APPROVE' ? 'LOCATION_VALID' : input.decision === 'REJECT' ? 'LOCATION_MISMATCH' : input.decision === 'REQUEST_RETRY' ? 'GPS_CAPTURING' : 'ADDRESS_EDITING';
    assertTransition(detail.session.verificationStatus, nextStatus);
    if (input.decision === 'APPROVE' && !detail.results[0]) throw new DomainError('Approval requires a recorded GPS validation result', 409, 'VALIDATION_RESULT_REQUIRED');
    const reviewedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx.insert(verificationReviews).values({ id: randomUUID(), sessionId: id, reviewerUserId: admin.id, decision: input.decision, reasonCode: input.reasonCode, reviewNote: input.reviewNote, engineResultSnapshot: detail.results[0] ?? null, beforeStatus: detail.session.verificationStatus, afterStatus: nextStatus, reviewedAt, createdAt: reviewedAt });
      await tx.update(verificationSessions).set({ verificationStatus: nextStatus, locationVerifiedAt: input.decision === 'APPROVE' ? reviewedAt : null, completedAt: input.decision === 'APPROVE' ? reviewedAt : null, updatedAt: reviewedAt }).where(eq(verificationSessions.id, id));
      await tx.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: input.decision === 'APPROVE' ? 'MANUAL_REVIEW_APPROVED' : input.decision === 'REJECT' ? 'MANUAL_REVIEW_REJECTED' : 'MANUAL_REVIEW_COMPLETED', entityType: 'REVIEW', entityId: id, before: { status: detail.session.verificationStatus }, after: { status: nextStatus, decision: input.decision, reasonCode: input.reasonCode }, reason: input.reviewNote, timestamp: reviewedAt });
      if (input.decision === 'APPROVE') {
        await tx.update(customerAddresses).set({ addressStatus: 'SUPERSEDED', addressType: 'HISTORICAL', isActive: false, validTo: reviewedAt, updatedAt: reviewedAt }).where(and(eq(customerAddresses.customerId, detail.customer.id), eq(customerAddresses.isActive, true), ne(customerAddresses.id, detail.address.id)));
        await tx.update(customerAddresses).set({ isVerified: true, addressStatus: 'VERIFIED', addressType: 'VERIFIED_INSTALLATION', updatedAt: reviewedAt }).where(eq(customerAddresses.id, detail.address.id));
        await tx.update(customers).set({ status: 'VERIFIED', updatedAt: reviewedAt }).where(eq(customers.id, detail.customer.id));
        const eventId = randomUUID();
        await tx.insert(integrationOutbox).values({ id: randomUUID(), eventId, eventType: 'location.verified.v1', aggregateType: 'VERIFICATION_SESSION', aggregateId: id, correlationId: id, idempotencyKey: `location-verified:${id}`, payload: { eventId, eventType: 'location.verified.v1', occurredAt: reviewedAt.toISOString(), correlationId: id, idempotencyKey: `location-verified:${id}`, customer: { externalId: detail.customer.externalId, name: detail.customer.name }, verifiedAddress: { addressId: detail.address.id, fullAddress: detail.address.rawAddress }, verifiedLocation: { latitude: Number(detail.results[0].capturedLatitude), longitude: Number(detail.results[0].capturedLongitude), accuracyMeters: Number(detail.results[0].gpsAccuracyMeters), verifiedAt: reviewedAt.toISOString() } }, status: 'PENDING', attemptCount: 0, createdAt: reviewedAt, updatedAt: reviewedAt }).onConflictDoNothing({ target: integrationOutbox.idempotencyKey });
      }
    });
    return { status: nextStatus };
  }

  async reminders(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(sql`${reminders.sessionId}::text ilike ${pattern}`, ilike(customers.name, pattern), ilike(customers.externalId, pattern), ilike(verificationSessions.registeredPhoneSnapshot, pattern)));
    }
    if (query.status) filters.push(eq(reminders.status, query.status as typeof reminders.$inferSelect.status));
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(reminders).innerJoin(verificationSessions, eq(verificationSessions.id, reminders.sessionId)).innerJoin(customers, eq(customers.id, verificationSessions.customerId)).where(where);
    const rows = await db.select({ reminder: reminders, session: verificationSessions, customer: customers }).from(reminders).innerJoin(verificationSessions, eq(verificationSessions.id, reminders.sessionId)).innerJoin(customers, eq(customers.id, verificationSessions.customerId)).where(where).orderBy(desc(reminders.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return { items: rows.map(({ reminder, session, customer }) => ({ ...reminder, session: sanitizeSession(session), customer })), page: query.page, pageSize: query.pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / query.pageSize) };
  }

  async audits(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(ilike(auditLogs.action, pattern), ilike(auditLogs.actorName, pattern), ilike(auditLogs.entityId, pattern), ilike(auditLogs.reason, pattern)));
    }
    if (query.status) filters.push(eq(auditLogs.entityType, query.status as typeof auditLogs.$inferSelect.entityType));
    if (query.actor === 'CUSTOMER') filters.push(eq(auditLogs.actorUserId, 'customer'));
    if (query.actor === 'SYSTEM') filters.push(eq(auditLogs.actorUserId, 'system'));
    if (query.actor === 'ADMIN') filters.push(ilike(auditLogs.actorUserId, 'usr-admin%'));
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(auditLogs).where(where);
    const items = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.timestamp)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return { items, page: query.page, pageSize: query.pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / query.pageSize) };
  }

  async settings() {
    return this.validationConfig.get();
  }

  async updateSettings(admin: RequestAdmin, input: ValidationConfigInput) {
    if (admin.role !== 'SUPER_ADMIN') throw new DomainError('Only SUPER_ADMIN can change validation configuration', 403, 'FORBIDDEN');
    const values = await this.validationConfig.update(admin.id, input);
    await db.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'CONFIG_UPDATED', entityType: 'CONFIG', entityId: 'validation_rules', after: input, timestamp: timestamp() });
    return values;
  }

  async integrations() { return db.select().from(integrationConfigs).orderBy(integrationConfigs.key); }
  async outbox(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(ilike(integrationOutbox.eventType, pattern), ilike(integrationOutbox.aggregateId, pattern), ilike(integrationOutbox.correlationId, pattern), ilike(integrationOutbox.idempotencyKey, pattern)));
    }
    if (query.status) filters.push(eq(integrationOutbox.status, query.status as typeof integrationOutbox.$inferSelect.status));
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(integrationOutbox).where(where);
    const items = await db.select().from(integrationOutbox).where(where).orderBy(desc(integrationOutbox.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return { items, page: query.page, pageSize: query.pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / query.pageSize) };
  }

  private async assertManualSendAllowed(phoneE164: string) {
    const [last] = await db.select({ sentAt: whatsappDeliveryLogs.sentAt }).from(whatsappDeliveryLogs).where(eq(whatsappDeliveryLogs.phoneHash, hashPhone(phoneE164))).orderBy(desc(whatsappDeliveryLogs.sentAt)).limit(1);
    const retryAt = nextAllowedSendAt(last?.sentAt ?? null, Number(process.env.WHATSAPP_MIN_INTERVAL_MINUTES ?? 60));
    if (retryAt) throw new DomainError(`WhatsApp cooldown active until ${retryAt.toISOString()}`, 429, 'WHATSAPP_COOLDOWN');
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const [daily] = await db.select({ total: sql<number>`count(*)` }).from(whatsappDeliveryLogs).where(sql`${whatsappDeliveryLogs.sentAt} >= ${dayStart}`);
    if (Number(daily.total) >= Number(process.env.WHATSAPP_DAILY_SEND_LIMIT ?? 10000)) throw new DomainError('WhatsApp daily send limit reached', 429, 'WHATSAPP_DAILY_LIMIT_REACHED');
  }

  private async recordManualDelivery(phoneE164: string, idempotencyKey: string, messageType: string) {
    await db.insert(whatsappDeliveryLogs).values({ id: randomUUID(), phoneHash: hashPhone(phoneE164), messageType, idempotencyKey, providerMessageId: idempotencyKey, sentAt: new Date(), createdAt: new Date() }).onConflictDoNothing({ target: whatsappDeliveryLogs.idempotencyKey });
  }
}
