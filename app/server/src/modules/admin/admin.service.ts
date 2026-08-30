import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, customerAddresses, customers, integrationConfigs, integrationOutbox, locationCaptures, reminders, validationResults, verificationReviews, verificationSessions } from '../../db/schema/index.js';
import { AddressChangeInput, CustomerCreateInput, ReviewInput, ValidationConfigInput } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { RequestAdmin } from '../../common/request-user.js';
import { WhatsAppPort } from '../../integrations/whatsapp/whatsapp.port.js';
import { assertTransition } from '../verification/state-machine.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const timestamp = () => new Date();
const canManage = (role: RequestAdmin['role']) => role === 'SUPER_ADMIN' || role === 'ADMIN';

function sanitizeSession(session: typeof verificationSessions.$inferSelect) {
  const { tokenHash: _tokenHash, ...safeSession } = session;
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

  async listCustomers() {
    return db.select().from(customers).orderBy(desc(customers.updatedAt));
  }

  async createCustomer(admin: RequestAdmin, input: CustomerCreateInput) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a customer', 403, 'FORBIDDEN');
    const created = timestamp();
    const customerId = randomUUID();
    const addressId = randomUUID();
    const address = input.address;
    const rawAddress = [
      address.street,
      `No. ${address.houseNumber}`,
      address.block && `Blok ${address.block}`,
      address.subdistrict,
      address.district,
      address.city,
      address.province,
      address.postalCode,
    ].filter(Boolean).join(', ');

    const result = await db.transaction(async (tx) => {
      const [customer] = await tx.insert(customers).values({
        id: customerId,
        externalId: input.externalId,
        name: input.name,
        phoneE164: input.phoneE164,
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

  async createVerification(admin: RequestAdmin, customerId: string, addressId: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a verification session', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [address] = await db.select().from(customerAddresses).where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId), eq(customerAddresses.isActive, true)));
    if (!customer || !address) throw new NotFoundError('Customer or active address not found');
    const rawToken = randomBytes(32).toString('base64url');
    const created = timestamp();
    const [session] = await db.insert(verificationSessions).values({
      id: randomUUID(), customerId, currentAddressId: addressId, tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000),
      verificationStatus: 'MESSAGE_SENT', customerConfirmationStatus: 'UNCONFIRMED', registeredPhoneSnapshot: customer.phoneE164,
      createdAt: created, updatedAt: created,
    }).returning();
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${rawToken}`;
    await this.whatsapp.send({ phoneE164: customer.phoneE164, messageText: `Halo ${customer.name}, silakan verifikasi lokasi melalui link: ${verificationLink}`, idempotencyKey: `invitation:${session.id}` });
    await db.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'VERIFICATION_CREATED', entityType: 'VERIFICATION_SESSION', entityId: session.id, after: { customerId, addressId, tokenStoredAsHash: true }, timestamp: created });
    return { sessionId: session.id, verificationLink, expiresAt: session.expiresAt };
  }

  async verifications() {
    const rows = await db.select({ session: verificationSessions, customer: customers }).from(verificationSessions).innerJoin(customers, eq(customers.id, verificationSessions.customerId)).orderBy(desc(verificationSessions.updatedAt));
    return rows.map(({ session, customer }) => ({ session: sanitizeSession(session), customer }));
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
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000);
    const updatedAt = timestamp();
    await db.update(verificationSessions).set({ tokenHash: hashToken(rawToken), expiresAt, updatedAt }).where(eq(verificationSessions.id, id));
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${rawToken}`;
    await this.whatsapp.send({ phoneE164: detail.customer.phoneE164, messageText: `Halo ${detail.customer.name}, berikut link verifikasi lokasi terbaru: ${verificationLink}`, idempotencyKey: `invitation-resend:${id}:${hashToken(rawToken)}` });
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

    // The raw token is never persisted. Rotate it and put the generated link
    // into the durable reminder record so the worker can deliver it safely.
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000);
    const scheduledAt = timestamp();
    const nextStatus = reminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME';
    assertTransition(detail.session.verificationStatus, nextStatus);
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${rawToken}`;
    const messageText = `Halo ${detail.customer.name}, ini pengingat verifikasi lokasi Anda: ${verificationLink}`;
    await db.transaction(async (tx) => {
      await tx.update(verificationSessions).set({ tokenHash: hashToken(rawToken), expiresAt, reminderCount: reminderNumber, verificationStatus: nextStatus, updatedAt: scheduledAt }).where(eq(verificationSessions.id, id));
      await tx.insert(reminders).values({
        id: randomUUID(),
        sessionId: id,
        reminderNumber,
        channel: 'WHATSAPP',
        scheduledAt,
        status: 'SCHEDULED',
        messageText,
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
    return { status: 'SCHEDULED', reminderNumber, verificationLink, expiresAt };
  }

  async review(admin: RequestAdmin, id: string, input: ReviewInput) {
    if (!['SUPER_ADMIN', 'ADMIN', 'REVIEWER'].includes(admin.role)) throw new DomainError('Role cannot perform manual review', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    const nextStatus = input.decision === 'APPROVE' ? 'LOCATION_VALID' : input.decision === 'REJECT' ? 'LOCATION_MISMATCH' : input.decision === 'REQUEST_RETRY' ? 'GPS_CAPTURING' : 'ADDRESS_EDITING';
    assertTransition(detail.session.verificationStatus, nextStatus);
    const reviewedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx.insert(verificationReviews).values({ id: randomUUID(), sessionId: id, reviewerUserId: admin.id, decision: input.decision, reasonCode: input.reasonCode, reviewNote: input.reviewNote, engineResultSnapshot: detail.results[0] ?? null, beforeStatus: detail.session.verificationStatus, afterStatus: nextStatus, reviewedAt, createdAt: reviewedAt });
      await tx.update(verificationSessions).set({ verificationStatus: nextStatus, locationVerifiedAt: input.decision === 'APPROVE' ? reviewedAt : null, completedAt: input.decision === 'APPROVE' ? reviewedAt : null, updatedAt: reviewedAt }).where(eq(verificationSessions.id, id));
      await tx.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'MANUAL_REVIEW_COMPLETED', entityType: 'REVIEW', entityId: id, before: { status: detail.session.verificationStatus }, after: { status: nextStatus, decision: input.decision, reasonCode: input.reasonCode }, reason: input.reviewNote, timestamp: reviewedAt });
      if (input.decision === 'APPROVE') {
        await tx.update(customerAddresses).set({ isVerified: true, addressStatus: 'VERIFIED', addressType: 'VERIFIED_INSTALLATION', updatedAt: reviewedAt }).where(eq(customerAddresses.id, detail.address.id));
        await tx.update(customers).set({ status: 'VERIFIED', updatedAt: reviewedAt }).where(eq(customers.id, detail.customer.id));
        const eventId = randomUUID();
        await tx.insert(integrationOutbox).values({ id: randomUUID(), eventId, eventType: 'location.verified.v1', aggregateType: 'VERIFICATION_SESSION', aggregateId: id, correlationId: id, idempotencyKey: `location-verified:${id}`, payload: { eventId, eventType: 'location.verified.v1', occurredAt: reviewedAt.toISOString(), correlationId: id, idempotencyKey: `location-verified:${id}`, customer: { externalId: detail.customer.externalId, name: detail.customer.name }, verifiedAddress: { addressId: detail.address.id, fullAddress: detail.address.rawAddress }, verifiedLocation: { latitude: Number(detail.results[0]?.capturedLatitude ?? 0), longitude: Number(detail.results[0]?.capturedLongitude ?? 0), accuracyMeters: Number(detail.results[0]?.gpsAccuracyMeters ?? 0), verifiedAt: reviewedAt.toISOString() } }, status: 'PENDING', attemptCount: 0, createdAt: reviewedAt, updatedAt: reviewedAt }).onConflictDoNothing({ target: integrationOutbox.idempotencyKey });
      }
    });
    return { status: nextStatus };
  }

  async reminders() { return db.select().from(reminders).orderBy(desc(reminders.createdAt)); }
  async audits() { return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)); }

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
  async outbox() { return db.select().from(integrationOutbox).orderBy(desc(integrationOutbox.createdAt)); }
}
