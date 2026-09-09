import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  auditLogs,
  authSessions,
  authUsers,
  customerAddresses,
  customers,
  integrationConfigs,
  integrationOutbox,
  locationCaptures,
  reminders,
  validationResults,
  verificationCampaignItems,
  verificationReviews,
  verificationSessions,
  whatsappDeliveryLogs,
} from '../../db/schema/index.js';
import {
  AdminListQueryInput,
  AdminUserCreateInput,
  AdminUserPasswordInput,
  AdminUserUpdateInput,
  CustomerCreateInput,
  CustomerListQueryInput,
  CustomerUpdateInput,
  ReviewInput,
  ValidationConfigInput,
} from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { RequestAdmin } from '../../common/request-user.js';
import { auth } from '../../auth/auth.js';
import { WhatsAppPort } from '../../integrations/whatsapp/whatsapp.port.js';
import { assertTransition } from '../verification/state-machine.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';
import { hashPhone, nextAllowedSendAt } from '../../integrations/whatsapp/whatsapp.policy.js';
import { createVerificationToken } from '../verification/verification-token.js';
import { getWhatsAppTemplate, renderWhatsAppTemplate } from '../../integrations/whatsapp/whatsapp.templates.js';
import { ReadCacheService } from '../../common/read-cache.service.js';
import { decodeListCursor, encodeListCursor } from '../../common/list-cursor.js';
import { buildVerificationSimulationConfig } from '../verification/simulation-config.js';
import { buildVerifiedAddressReference } from '../verification/verified-location.js';
import { campaignRecipientReservationStatuses } from '../campaigns/campaign-target.policy.js';
const timestamp = () => new Date();
const canManage = (role: RequestAdmin['role']) => role === 'SUPER_ADMIN' || role === 'ADMIN';
const customerAuditActorIds = ['customer', 'customer-token'];
const systemAuditActorIds = ['system', 'whatsapp-webhook', 'whatsapp-inbound'];
const addressPlaceholders = new Set(['', 'unknown', 'tidak diketahui', 'tanpa nomor', 'n/a', 'na', '-', '00000']);
const addressText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isMissingAddressText = (value: unknown) => addressPlaceholders.has(addressText(value).toLowerCase());
const fillMissingAddressText = (current: unknown, gpsValue: unknown) =>
  isMissingAddressText(current) && !isMissingAddressText(gpsValue) ? addressText(gpsValue) : addressText(current);

function formatRawAddress(address: CustomerCreateInput['address']) {
  return [
    address.street,
    address.houseNumber && `No. ${address.houseNumber}`,
    address.block && `Blok ${address.block}`,
    address.addressDetail,
    address.landmark && `Patokan: ${address.landmark}`,
    address.subdistrict,
    address.district,
    address.city,
    address.province,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(', ');
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
    private readonly readCache: ReadCacheService,
  ) {}

  async me(admin: RequestAdmin) {
    return admin;
  }

  async listUsers(query: { search?: string } = {}) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(ilike(authUsers.name, pattern), ilike(authUsers.email, pattern), ilike(authUsers.department, pattern)),
      );
    }
    const items = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        department: authUsers.department,
        disabledAt: authUsers.disabledAt,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      })
      .from(authUsers)
      .where(and(...filters))
      .orderBy(desc(authUsers.createdAt), desc(authUsers.name));
    return { items, total: items.length };
  }

  async createUser(admin: RequestAdmin, input: AdminUserCreateInput) {
    const existing = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, input.email))
      .limit(1);
    if (existing.length) throw new DomainError('Email user sudah terdaftar.', 409, 'USER_EMAIL_EXISTS');

    let createdId: string;
    try {
      const result = await auth.api.signUpEmail({
        body: { name: input.name, email: input.email, password: input.password },
      });
      if (!result.user) throw new Error('Better Auth tidak mengembalikan user baru.');
      createdId = result.user.id;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('User gagal dibuat. Pastikan email belum digunakan.', 400, 'USER_CREATE_FAILED');
    }

    const [created] = await db
      .update(authUsers)
      .set({ role: input.role, department: input.department || null, disabledAt: null, updatedAt: timestamp() })
      .where(eq(authUsers.id, createdId))
      .returning({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        department: authUsers.department,
        disabledAt: authUsers.disabledAt,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      });
    if (!created) throw new DomainError('User berhasil dibuat tetapi gagal dimuat ulang.', 500, 'USER_CREATE_FAILED');
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'ADMIN_USER_CREATED',
      entityType: 'ADMIN_USER',
      entityId: created.id,
      after: { name: created.name, email: created.email, role: created.role, department: created.department },
      timestamp: timestamp(),
    });
    return created;
  }

  async updateUser(admin: RequestAdmin, id: string, input: AdminUserUpdateInput) {
    const [before] = await db.select().from(authUsers).where(eq(authUsers.id, id)).limit(1);
    if (!before) throw new NotFoundError('User tidak ditemukan.');
    if (id === admin.id && input.role && input.role !== 'SUPER_ADMIN')
      throw new DomainError('Role akun Anda sendiri tidak dapat diturunkan.', 400, 'SELF_ROLE_CHANGE_FORBIDDEN');
    const [updated] = await db
      .update(authUsers)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.department !== undefined ? { department: input.department || null } : {}),
        updatedAt: timestamp(),
      })
      .where(eq(authUsers.id, id))
      .returning({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        department: authUsers.department,
        disabledAt: authUsers.disabledAt,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      });
    if (!updated) throw new NotFoundError('User tidak ditemukan.');
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'ADMIN_USER_UPDATED',
      entityType: 'ADMIN_USER',
      entityId: id,
      before: { name: before.name, email: before.email, role: before.role, department: before.department },
      after: { name: updated.name, email: updated.email, role: updated.role, department: updated.department },
      timestamp: timestamp(),
    });
    return updated;
  }

  async resetUserPassword(admin: RequestAdmin, id: string, input: AdminUserPasswordInput) {
    const [user] = await db
      .select({ id: authUsers.id, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .limit(1);
    if (!user) throw new NotFoundError('User tidak ditemukan.');
    const passwordHash = await (await auth.$context).password.hash(input.password);
    await (await auth.$context).internalAdapter.updatePassword(id, passwordHash);
    await db.delete(authSessions).where(eq(authSessions.userId, id));
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'ADMIN_USER_PASSWORD_RESET',
      entityType: 'ADMIN_USER',
      entityId: id,
      after: { email: user.email },
      timestamp: timestamp(),
    });
    return { id, status: 'PASSWORD_RESET' };
  }

  async setUserDisabled(admin: RequestAdmin, id: string, disabled: boolean) {
    if (id === admin.id)
      throw new DomainError('Akun yang sedang digunakan tidak dapat dinonaktifkan.', 400, 'SELF_DISABLE_FORBIDDEN');
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, id)).limit(1);
    if (!user) throw new NotFoundError('User tidak ditemukan.');
    const disabledAt = disabled ? timestamp() : null;
    const [updated] = await db
      .update(authUsers)
      .set({ disabledAt, updatedAt: timestamp() })
      .where(eq(authUsers.id, id))
      .returning({ id: authUsers.id, disabledAt: authUsers.disabledAt });
    if (disabled) await db.delete(authSessions).where(eq(authSessions.userId, id));
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: disabled ? 'ADMIN_USER_DISABLED' : 'ADMIN_USER_ENABLED',
      entityType: 'ADMIN_USER',
      entityId: id,
      before: { disabledAt: user.disabledAt },
      after: { disabledAt: updated?.disabledAt ?? null },
      timestamp: timestamp(),
    });
    return { id, status: disabled ? 'DISABLED' : 'ACTIVE', disabledAt: updated?.disabledAt ?? null };
  }

  async dashboard() {
    const cached = await this.readCache.getOrSet(
      'dashboard',
      'summary',
      Number(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? 30),
      async () => {
        const [customerStats] = await db
          .select({
            total: sql<number>`count(*)`,
            active: sql<number>`count(*) filter (where ${customers.status} = 'ACTIVE')`,
            verified: sql<number>`count(*) filter (where ${customers.status} = 'VERIFIED')`,
            whatsappOptedIn: sql<number>`count(*) filter (where ${customers.whatsappOptInAt} is not null and ${customers.whatsappOptOutAt} is null)`,
            whatsappOptedOut: sql<number>`count(*) filter (where ${customers.whatsappOptOutAt} is not null)`,
          })
          .from(customers);

        const [verificationStats] = await db
          .select({
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
          })
          .from(verificationSessions);

        const [reminderStats, outboxStats, verificationStatusRows, reminderNumberRows] = await Promise.all([
          db
            .select({
              total: sql<number>`count(*)`,
              scheduled: sql<number>`count(*) filter (where ${reminders.status} = 'SCHEDULED')`,
              sent: sql<number>`count(*) filter (where ${reminders.status} = 'SENT')`,
              failed: sql<number>`count(*) filter (where ${reminders.status} = 'FAILED')`,
              cancelled: sql<number>`count(*) filter (where ${reminders.status} = 'CANCELLED')`,
            })
            .from(reminders),
          db
            .select({
              total: sql<number>`count(*)`,
              pending: sql<number>`count(*) filter (where ${integrationOutbox.status} = 'PENDING')`,
              published: sql<number>`count(*) filter (where ${integrationOutbox.status} = 'PUBLISHED')`,
              failed: sql<number>`count(*) filter (where ${integrationOutbox.status} = 'FAILED')`,
            })
            .from(integrationOutbox),
          db
            .select({ status: verificationSessions.verificationStatus, total: sql<number>`count(*)` })
            .from(verificationSessions)
            .groupBy(verificationSessions.verificationStatus),
          db
            .select({
              reminderNumber: reminders.reminderNumber,
              total: sql<number>`count(*) filter (where ${reminders.status} = 'SENT')`,
            })
            .from(reminders)
            .groupBy(reminders.reminderNumber),
        ]);

        const toNumber = (value: number | string | null | undefined) => Number(value ?? 0);
        const statusCounts = Object.fromEntries(verificationStatusRows.map((row) => [row.status, toNumber(row.total)]));
        const byNumber = Object.fromEntries(
          reminderNumberRows.map((row) => [String(row.reminderNumber), toNumber(row.total)]),
        );

        const countAsOf = new Date().toISOString();
        return {
          generatedAt: countAsOf,
          countAsOf,
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
      },
    );
    return cached;
  }

  async listCustomers(query: CustomerListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          ilike(customers.name, pattern),
          ilike(customers.externalId, pattern),
          ilike(customers.phoneE164, pattern),
          ilike(customers.sourceRecordId, pattern),
        ),
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
    if (query.campaignAvailable) {
      const statuses = sql.join(campaignRecipientReservationStatuses.map((status) => sql`${status}`), sql`, `);
      filters.push(sql`not exists (
        select 1
        from "verification_campaign_items" reserved_item
        where reserved_item."customer_id" = ${customers.id}
          and reserved_item."status" in (${statuses})
      ) and not exists (
        select 1
        from "verification_campaigns" reserved_campaign
        where reserved_campaign."status" in ('DRAFT', 'RUNNING')
          and reserved_campaign."target_filter" -> 'customerIds' ? (${customers.id})::text
      )`);
    }
    const where = and(...filters);
    const cachedCount = await this.readCache.count(
      'customers',
      { search: query.search, status: query.status, locationStatus: query.locationStatus, campaignAvailable: query.campaignAvailable },
      async () => {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(customers)
          .where(where);
        return Number(total);
      },
    );
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(customers.updatedAt, new Date(cursor.value)),
          and(eq(customers.updatedAt, new Date(cursor.value)), lt(customers.id, cursor.id)),
        )
      : undefined;
    const customerRows = await db
      .select()
      .from(customers)
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(desc(customers.updatedAt), desc(customers.id))
      .offset(cursor ? 0 : (query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    const customerIds = customerRows.map((customer) => customer.id);
    if (!customerIds.length)
      return {
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: cachedCount.total,
        totalPages: Math.ceil(cachedCount.total / query.pageSize),
        nextCursor: null,
        hasMore: false,
        countAsOf: cachedCount.countAsOf,
      };

    const addressRows = await db
      .select({
        address: customerAddresses,
        referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(customerAddresses)
      .where(and(inArray(customerAddresses.customerId, customerIds), eq(customerAddresses.isActive, true)))
      .orderBy(desc(customerAddresses.updatedAt), desc(customerAddresses.createdAt));
    const sessionRows = await db
      .select()
      .from(verificationSessions)
      .where(inArray(verificationSessions.customerId, customerIds))
      .orderBy(desc(verificationSessions.updatedAt));
    const addressByCustomer = new Map<string, Record<string, unknown>>();
    for (const row of addressRows)
      if (!addressByCustomer.has(row.address.customerId))
        addressByCustomer.set(row.address.customerId, {
          ...row.address,
          referenceLocation:
            row.referenceLatitude == null || row.referenceLongitude == null
              ? null
              : { latitude: Number(row.referenceLatitude), longitude: Number(row.referenceLongitude) },
        });
    const sessionByCustomer = new Map<string, (typeof sessionRows)[number]>();
    for (const session of sessionRows)
      if (!sessionByCustomer.has(session.customerId)) sessionByCustomer.set(session.customerId, session);
    return {
      items: customerRows.map((customer) => ({
        ...customer,
        activeAddress: addressByCustomer.get(customer.id) ?? null,
        latestVerification: sessionByCustomer.get(customer.id)
          ? sanitizeSession(sessionByCustomer.get(customer.id)!)
          : null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        customerRows.length === query.pageSize
          ? encodeListCursor(customerRows[customerRows.length - 1].updatedAt, customerRows[customerRows.length - 1].id)
          : null,
      hasMore: customerRows.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
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
      const [customer] = await tx
        .insert(customers)
        .values({
          id: customerId,
          externalId: input.externalId,
          name: input.name,
          phoneE164: input.phoneE164,
          whatsappOptInAt: input.whatsappOptInAt ? new Date(input.whatsappOptInAt) : null,
          whatsappOptInSource: input.whatsappOptInSource ?? null,
          status: input.status,
          createdAt: created,
          updatedAt: created,
        })
        .returning();
      const [createdAddress] = await tx
        .insert(customerAddresses)
        .values({
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
          houseNumber: address.houseNumber.trim(),
          rt: address.rt,
          rw: address.rw,
          building: address.building,
          block: address.block,
          unit: address.unit,
          addressDetail: address.addressDetail,
          landmark: address.landmark,
          referenceLocation: address.referenceLocation ?? null,
          referenceSource: address.referenceSource,
          referencePrecision: address.referencePrecision,
          referenceConfidence: address.referenceConfidence.toFixed(3),
          isActive: true,
          isVerified: false,
          validFrom: created,
          createdAt: created,
          updatedAt: created,
        })
        .returning();
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
    return { ...result, address: { ...result.address, referenceLocation: address.referenceLocation ?? null } };
  }

  async customer(id: string) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) throw new NotFoundError('Customer not found');
    const addressRows = await db
      .select({
        address: customerAddresses,
        referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, id));
    const addresses = addressRows.map(({ address, referenceLatitude, referenceLongitude }) => ({
      ...address,
      referenceLocation:
        referenceLatitude == null || referenceLongitude == null
          ? null
          : { latitude: Number(referenceLatitude), longitude: Number(referenceLongitude) },
    }));
    const sessions = await db
      .select()
      .from(verificationSessions)
      .where(eq(verificationSessions.customerId, id))
      .orderBy(desc(verificationSessions.createdAt));
    return { customer, addresses, sessions: sessions.map(sanitizeSession) };
  }

  async updateCustomer(admin: RequestAdmin, id: string, input: CustomerUpdateInput) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot update a customer', 403, 'FORBIDDEN');
    const [existing] = await db.select().from(customers).where(eq(customers.id, id));
    if (!existing) throw new NotFoundError('Customer not found');
    const [activeAddress] = await db
      .select()
      .from(customerAddresses)
      .where(and(eq(customerAddresses.customerId, id), eq(customerAddresses.isActive, true)))
      .orderBy(desc(customerAddresses.updatedAt))
      .limit(1);
    const updatedAt = timestamp();

    const result = await db.transaction(async (tx) => {
      const [customer] = await tx
        .update(customers)
        .set({
          externalId: input.externalId ?? existing.externalId,
          name: input.name ?? existing.name,
          phoneE164: input.phoneE164 ?? existing.phoneE164,
          whatsappOptInAt:
            input.whatsappOptInAt === undefined
              ? existing.whatsappOptInAt
              : input.whatsappOptInAt
                ? new Date(input.whatsappOptInAt)
                : null,
          whatsappOptInSource:
            input.whatsappOptInSource === undefined ? existing.whatsappOptInSource : input.whatsappOptInSource,
          status: input.status ?? existing.status,
          updatedAt,
        })
        .where(eq(customers.id, id))
        .returning();

      let address = activeAddress;
      if (input.address && activeAddress) {
        const nextAddress = input.address;
        [address] = await tx
          .update(customerAddresses)
          .set({
            addressStatus: 'ACTIVE',
            addressType: 'MASTER',
            rawAddress: formatRawAddress(nextAddress),
            province: nextAddress.province,
            city: nextAddress.city,
            district: nextAddress.district,
            subdistrict: nextAddress.subdistrict,
            postalCode: nextAddress.postalCode,
            street: nextAddress.street,
            houseNumber: nextAddress.houseNumber.trim(),
            rt: nextAddress.rt,
            rw: nextAddress.rw,
            building: nextAddress.building,
            block: nextAddress.block,
            unit: nextAddress.unit,
            addressDetail: nextAddress.addressDetail,
            landmark: nextAddress.landmark,
            referenceLocation: nextAddress.referenceLocation ?? null,
            referenceSource: nextAddress.referenceSource,
            referencePrecision: nextAddress.referencePrecision,
            referenceConfidence: nextAddress.referenceConfidence.toFixed(3),
            isVerified: false,
            validTo: null,
            updatedAt,
          })
          .where(eq(customerAddresses.id, activeAddress.id))
          .returning();
      }
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_UPDATED',
        entityType: 'CUSTOMER',
        entityId: id,
        before: {
          externalId: existing.externalId,
          name: existing.name,
          phoneE164: existing.phoneE164,
          status: existing.status,
        },
        after: {
          externalId: customer.externalId,
          name: customer.name,
          phoneE164: customer.phoneE164,
          status: customer.status,
          addressUpdated: Boolean(input.address),
        },
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
    await db.transaction(async (tx) => {
      const addressRows = await tx
        .select({ id: customerAddresses.id })
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, id));
      const sessionRows = await tx
        .select({ id: verificationSessions.id })
        .from(verificationSessions)
        .where(eq(verificationSessions.customerId, id));
      const addressIds = addressRows.map((row) => row.id);
      const sessionIds = sessionRows.map((row) => row.id);

      // Remove dependent records first because these foreign keys intentionally
      // do not cascade: campaign items, validation evidence, reviews, reminders,
      // captures, sessions, addresses, and finally the customer.
      await tx.delete(verificationCampaignItems).where(eq(verificationCampaignItems.customerId, id));
      if (sessionIds.length > 0) {
        await tx.delete(validationResults).where(inArray(validationResults.sessionId, sessionIds));
        await tx.delete(verificationReviews).where(inArray(verificationReviews.sessionId, sessionIds));
        await tx.delete(reminders).where(inArray(reminders.sessionId, sessionIds));
        await tx.delete(locationCaptures).where(inArray(locationCaptures.sessionId, sessionIds));
        await tx.delete(integrationOutbox).where(inArray(integrationOutbox.aggregateId, sessionIds));
        await tx.delete(verificationSessions).where(inArray(verificationSessions.id, sessionIds));
      }
      if (addressIds.length > 0) await tx.delete(customerAddresses).where(inArray(customerAddresses.id, addressIds));
      await tx.delete(customers).where(eq(customers.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'CUSTOMER_DELETED',
        entityType: 'CUSTOMER',
        entityId: id,
        before: { status: existing.status },
        after: { status: 'DELETED' },
        reason: 'Penghapusan permanen dari panel admin',
        timestamp: timestamp(),
      });
    });
    return { id, status: 'DELETED' as const };
  }

  async createVerification(admin: RequestAdmin, customerId: string, addressId: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a verification session', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [address] = await db
      .select()
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, addressId),
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.isActive, true),
        ),
      );
    if (!customer || !address) throw new NotFoundError('Customer or active address not found');
    if (customer.whatsappOptOutAt)
      throw new DomainError('Customer has opted out of WhatsApp messages', 422, 'CUSTOMER_OPTED_OUT');
    await this.assertManualSendAllowed(customer.phoneE164);
    const verificationToken = await createVerificationToken();
    const created = timestamp();
    const [session] = await db
      .insert(verificationSessions)
      .values({
        id: randomUUID(),
        customerId,
        currentAddressId: addressId,
        tokenId: verificationToken.tokenId,
        tokenHash: verificationToken.tokenHash,
        expiresAt: new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000),
        verificationStatus: 'CREATED',
        customerConfirmationStatus: 'UNCONFIRMED',
        registeredPhoneSnapshot: customer.phoneE164,
        createdAt: created,
        updatedAt: created,
      })
      .returning();
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
    const invitationTemplate = getWhatsAppTemplate('INVITATION');
    let sent;
    try {
      sent = await this.whatsapp.send({
        phoneE164: customer.phoneE164,
        recipientName: customer.name,
        templateName: invitationTemplate.name,
        messageTemplateId: invitationTemplate.messageTemplateId,
        templateLanguage: invitationTemplate.language,
        templateParameters: [customer.name, verificationLink],
        templateParameterNames: invitationTemplate.parameterNames,
        idempotencyKey: `invitation:${session.id}`,
      });
    } catch (error) {
      await db
        .update(verificationSessions)
        .set({ verificationStatus: 'CREATED', updatedAt: timestamp() })
        .where(eq(verificationSessions.id, session.id));
      throw error;
    }
    await this.recordManualDelivery(
      customer.phoneE164,
      `invitation:${session.id}`,
      'CAMPAIGN_INVITATION',
      sent.providerMessageId,
    );
    await db
      .update(verificationSessions)
      .set({ verificationStatus: 'MESSAGE_SENT', updatedAt: timestamp() })
      .where(eq(verificationSessions.id, session.id));
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'VERIFICATION_CREATED',
      entityType: 'VERIFICATION_SESSION',
      entityId: session.id,
      after: { customerId, addressId, tokenStoredAsHash: true },
      timestamp: created,
    });
    return { sessionId: session.id, verificationLink, expiresAt: session.expiresAt };
  }

  async createSimulationVerification(admin: RequestAdmin, customerId: string, addressId: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a verification session', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    const [addressRow] = await db
      .select({
        address: customerAddresses,
        referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, addressId),
          eq(customerAddresses.customerId, customerId),
          eq(customerAddresses.isActive, true),
        ),
      );
    if (!customer || !addressRow) throw new NotFoundError('Customer or active address not found');
    if (customer.whatsappOptOutAt)
      throw new DomainError('Customer has opted out of WhatsApp messages', 422, 'CUSTOMER_OPTED_OUT');

    const verificationToken = await createVerificationToken();
    const created = timestamp();
    const [session] = await db
      .insert(verificationSessions)
      .values({
        id: randomUUID(),
        customerId,
        currentAddressId: addressId,
        tokenId: verificationToken.tokenId,
        tokenHash: verificationToken.tokenHash,
        verificationMode: 'SIMULATION',
        expiresAt: new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000),
        verificationStatus: 'MESSAGE_SENT',
        customerConfirmationStatus: 'UNCONFIRMED',
        registeredPhoneSnapshot: customer.phoneE164,
        createdAt: created,
        updatedAt: created,
      })
      .returning();
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
    const invitationTemplate = getWhatsAppTemplate('INVITATION');
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'VERIFICATION_SIMULATION_CREATED',
      entityType: 'VERIFICATION_SESSION',
      entityId: session.id,
      after: { customerId, addressId, tokenStoredAsHash: true, whatsappSkipped: true },
      timestamp: created,
    });
    return {
      simulation: true,
      sessionId: session.id,
      recipient: { name: customer.name, phoneE164: customer.phoneE164 },
      templateName: invitationTemplate.name,
      language: invitationTemplate.language,
      message: renderWhatsAppTemplate('INVITATION', customer.name, verificationLink),
      verificationLink,
      referenceLocation:
        addressRow.referenceLatitude == null || addressRow.referenceLongitude == null
          ? null
          : { latitude: Number(addressRow.referenceLatitude), longitude: Number(addressRow.referenceLongitude) },
      referencePrecision: addressRow.address.referencePrecision,
      simulationConfig: buildVerificationSimulationConfig(config),
      expiresAt: session.expiresAt,
    };
  }

  async verifications(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          sql`${verificationSessions.id}::text ilike ${pattern}`,
          ilike(customers.name, pattern),
          ilike(customers.externalId, pattern),
          ilike(verificationSessions.registeredPhoneSnapshot, pattern),
        ),
      );
    }
    if (query.status)
      filters.push(
        eq(
          verificationSessions.verificationStatus,
          query.status as typeof verificationSessions.$inferSelect.verificationStatus,
        ),
      );
    const where = and(...filters);
    const cachedCount = await this.readCache.count(
      'verifications',
      { search: query.search, status: query.status },
      async () => {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(verificationSessions)
          .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
          .where(where);
        return Number(total);
      },
    );
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(verificationSessions.updatedAt, new Date(cursor.value)),
          and(eq(verificationSessions.updatedAt, new Date(cursor.value)), lt(verificationSessions.id, cursor.id)),
        )
      : undefined;
    const rows = await db
      .select({ session: verificationSessions, customer: customers })
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(desc(verificationSessions.updatedAt), desc(verificationSessions.id))
      .offset(cursor ? 0 : (query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    const resultRows = rows.length
      ? await db
          .select()
          .from(validationResults)
          .where(
            inArray(
              validationResults.sessionId,
              rows.map(({ session }) => session.id),
            ),
          )
          .orderBy(desc(validationResults.createdAt))
      : [];
    const resultBySession = new Map<string, (typeof resultRows)[number]>();
    for (const result of resultRows)
      if (!resultBySession.has(result.sessionId)) resultBySession.set(result.sessionId, result);
    return {
      items: rows.map(({ session, customer }) => ({
        session: { ...sanitizeSession(session), lastValidationResult: resultBySession.get(session.id) ?? null },
        customer,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        rows.length === query.pageSize
          ? encodeListCursor(rows[rows.length - 1].session.updatedAt, rows[rows.length - 1].session.id)
          : null,
      hasMore: rows.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
    };
  }

  async verification(id: string) {
    const [row] = await db
      .select({
        session: verificationSessions,
        customer: customers,
        address: customerAddresses,
        referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
        referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
      })
      .from(verificationSessions)
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .innerJoin(customerAddresses, eq(customerAddresses.id, verificationSessions.currentAddressId))
      .where(eq(verificationSessions.id, id));
    if (!row) throw new NotFoundError('Verification session not found');
    const address = {
      ...row.address,
      referenceLocation:
        row.referenceLatitude == null || row.referenceLongitude == null
          ? null
          : { latitude: Number(row.referenceLatitude), longitude: Number(row.referenceLongitude) },
    };
    const [results, reviews, sessionReminders, audits, captures] = await Promise.all([
      db
        .select()
        .from(validationResults)
        .where(eq(validationResults.sessionId, id))
        .orderBy(desc(validationResults.createdAt)),
      db
        .select()
        .from(verificationReviews)
        .where(eq(verificationReviews.sessionId, id))
        .orderBy(desc(verificationReviews.createdAt)),
      db.select().from(reminders).where(eq(reminders.sessionId, id)).orderBy(desc(reminders.createdAt)),
      db
        .select()
        .from(auditLogs)
        .where(sql`${auditLogs.entityId} = ${id}`)
        .orderBy(desc(auditLogs.timestamp)),
      db
        .select()
        .from(locationCaptures)
        .where(eq(locationCaptures.sessionId, id))
        .orderBy(desc(locationCaptures.createdAt)),
    ]);
    return {
      session: sanitizeSession(row.session),
      customer: row.customer,
      address,
      results,
      reviews,
      reminders: sessionReminders,
      audits,
      captures,
    };
  }

  async updateAddressFromGps(admin: RequestAdmin, id: string) {
    if (!['SUPER_ADMIN', 'ADMIN', 'REVIEWER'].includes(admin.role))
      throw new DomainError('Role cannot update address from GPS', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    if (['LOCATION_VALID', 'EXPIRED'].includes(detail.session.verificationStatus))
      throw new DomainError('Completed or expired sessions cannot update their address', 409, 'SESSION_NOT_EDITABLE');
    const result = detail.results[0];
    if (!result)
      throw new DomainError(
        'Address update requires a recorded GPS validation result',
        409,
        'VALIDATION_RESULT_REQUIRED',
      );

    const latitude = Number(result.capturedLatitude);
    const longitude = Number(result.capturedLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      throw new DomainError('Recorded GPS coordinates are invalid', 409, 'GPS_COORDINATE_INVALID');
    const reverse =
      result.reverseGeocode && typeof result.reverseGeocode === 'object'
        ? (result.reverseGeocode as Record<string, unknown>)
        : {};
    const nextAddress = {
      province: fillMissingAddressText(detail.address.province, reverse.province),
      city: fillMissingAddressText(detail.address.city, reverse.city),
      district: fillMissingAddressText(detail.address.district, reverse.district),
      subdistrict: fillMissingAddressText(detail.address.subdistrict, reverse.subdistrict),
      postalCode: fillMissingAddressText(detail.address.postalCode, reverse.postalCode),
      street: fillMissingAddressText(detail.address.street, reverse.street),
      houseNumber: fillMissingAddressText(detail.address.houseNumber, reverse.houseNumber),
    };
    const updatedFields = Object.keys(nextAddress).filter(
      (field) =>
        nextAddress[field as keyof typeof nextAddress] !==
        addressText(detail.address[field as keyof typeof nextAddress]),
    );
    const rawAddress = [
      nextAddress.street,
      nextAddress.houseNumber && `No. ${nextAddress.houseNumber}`,
      detail.address.block && `Blok ${detail.address.block}`,
      detail.address.addressDetail,
      detail.address.landmark && `Patokan: ${detail.address.landmark}`,
      nextAddress.subdistrict,
      nextAddress.district,
      nextAddress.city,
      nextAddress.province,
      nextAddress.postalCode,
    ]
      .filter(Boolean)
      .join(', ');
    const updatedAt = timestamp();
    const verifiedAddressReference = buildVerifiedAddressReference(latitude, longitude);

    await db.transaction(async (tx) => {
      await tx
        .update(customerAddresses)
        .set({
          ...nextAddress,
          rawAddress,
          ...verifiedAddressReference,
          updatedAt,
        })
        .where(eq(customerAddresses.id, detail.address.id));
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action: 'ADDRESS_UPDATED_FROM_GPS',
        entityType: 'ADDRESS',
        entityId: detail.address.id,
        before: {
          referenceLocation: detail.address.referenceLocation,
          referencePrecision: detail.address.referencePrecision,
          address: detail.address.rawAddress,
        },
        after: { referenceLocation: { latitude, longitude }, referencePrecision: 'HOUSE', updatedFields },
        reason: 'Admin memperbarui referensi alamat berdasarkan GPS hasil pemeriksaan manual.',
        timestamp: updatedAt,
      });
    });
    return {
      status: 'UPDATED',
      addressId: detail.address.id,
      updatedFields,
      referenceLocation: { latitude, longitude },
    };
  }

  async resend(admin: RequestAdmin, id: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot resend verification', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    const detail = await this.verification(id);
    if (detail.session.revokedAt || detail.session.expiresAt <= timestamp())
      throw new DomainError('Session is expired or revoked', 409, 'SESSION_EXPIRED');
    if (detail.session.verificationStatus === 'LOCATION_VALID')
      throw new DomainError('Verified sessions cannot be resent', 409, 'SESSION_COMPLETED');
    if (detail.customer.whatsappOptOutAt)
      throw new DomainError('Customer has opted out of WhatsApp messages', 422, 'CUSTOMER_OPTED_OUT');
    await this.assertManualSendAllowed(detail.customer.phoneE164);
    const verificationToken = await createVerificationToken();
    const expiresAt = new Date(Date.now() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000);
    const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
    const idempotencyKey = `invitation-resend:${id}:${verificationToken.tokenId}`;
    const invitationTemplate = getWhatsAppTemplate('INVITATION');
    const sent = await this.whatsapp.send({
      phoneE164: detail.customer.phoneE164,
      recipientName: detail.customer.name,
      templateName: invitationTemplate.name,
      messageTemplateId: invitationTemplate.messageTemplateId,
      templateLanguage: invitationTemplate.language,
      templateParameters: [detail.customer.name, verificationLink],
      templateParameterNames: invitationTemplate.parameterNames,
      idempotencyKey,
    });
    const updatedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx
        .update(reminders)
        .set({ tokenInvalidatedAt: updatedAt })
        .where(and(eq(reminders.sessionId, id), isNotNull(reminders.tokenId), isNull(reminders.tokenInvalidatedAt)));
      await tx
        .update(verificationSessions)
        .set({ tokenId: verificationToken.tokenId, tokenHash: verificationToken.tokenHash, expiresAt, updatedAt })
        .where(eq(verificationSessions.id, id));
    });
    await this.recordManualDelivery(
      detail.customer.phoneE164,
      idempotencyKey,
      'INVITATION_RESEND',
      sent.providerMessageId,
    );
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'INVITATION_RESENT',
      entityType: 'VERIFICATION_SESSION',
      entityId: id,
      after: { tokenRotated: true, tokenStoredAsHash: true, expiresAt: expiresAt.toISOString() },
      timestamp: updatedAt,
    });
    return { status: 'SENT', verificationLink, expiresAt };
  }

  async revoke(admin: RequestAdmin, id: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot revoke verification', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    assertTransition(detail.session.verificationStatus, 'EXPIRED');
    const revokedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx
        .update(verificationSessions)
        .set({ revokedAt, verificationStatus: 'EXPIRED', updatedAt: revokedAt })
        .where(eq(verificationSessions.id, id));
      await tx
        .update(reminders)
        .set({ status: 'CANCELLED' })
        .where(and(eq(reminders.sessionId, id), eq(reminders.status, 'SCHEDULED')));
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
    if (detail.session.revokedAt || detail.session.expiresAt <= timestamp())
      throw new DomainError('Session is expired or revoked', 409, 'SESSION_EXPIRED');
    if (detail.session.verificationStatus === 'LOCATION_VALID' || detail.session.verificationStatus === 'EXPIRED')
      throw new DomainError('Completed sessions cannot receive reminders', 409, 'SESSION_COMPLETED');
    if (reminderNumber > max) throw new DomainError('Reminder limit reached', 409, 'REMINDER_LIMIT_REACHED');

    const scheduledAt = timestamp();
    const nextStatus = reminderNumber >= max ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME';
    assertTransition(detail.session.verificationStatus, nextStatus);
    await db.transaction(async (tx) => {
      await tx
        .update(verificationSessions)
        .set({ reminderCount: reminderNumber, verificationStatus: nextStatus, updatedAt: scheduledAt })
        .where(eq(verificationSessions.id, id));
      await tx.insert(reminders).values({
        id: randomUUID(),
        sessionId: id,
        reminderNumber,
        channel: 'WHATSAPP',
        scheduledAt,
        status: 'SCHEDULED',
        messageText: `Halo ${detail.customer.name}, ini pengingat verifikasi lokasi Anda. Pengingat ${reminderNumber} dari ${max}. Tautan baru berlaku maksimal ${config.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`,
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
    if (!['SUPER_ADMIN', 'ADMIN', 'REVIEWER'].includes(admin.role))
      throw new DomainError('Role cannot perform manual review', 403, 'FORBIDDEN');
    const detail = await this.verification(id);
    const nextStatus =
      input.decision === 'APPROVE'
        ? 'LOCATION_VALID'
        : input.decision === 'REJECT'
          ? 'LOCATION_MISMATCH'
          : input.decision === 'REQUEST_RETRY'
            ? 'GPS_CAPTURING'
            : 'ADDRESS_EDITING';
    assertTransition(detail.session.verificationStatus, nextStatus);
    if (input.decision === 'APPROVE' && !detail.results[0])
      throw new DomainError('Approval requires a recorded GPS validation result', 409, 'VALIDATION_RESULT_REQUIRED');
    const reviewedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx.insert(verificationReviews).values({
        id: randomUUID(),
        sessionId: id,
        reviewerUserId: admin.id,
        decision: input.decision,
        reasonCode: input.reasonCode,
        reviewNote: input.reviewNote,
        engineResultSnapshot: detail.results[0] ?? null,
        beforeStatus: detail.session.verificationStatus,
        afterStatus: nextStatus,
        reviewedAt,
        createdAt: reviewedAt,
      });
      await tx
        .update(verificationSessions)
        .set({
          verificationStatus: nextStatus,
          locationVerifiedAt: input.decision === 'APPROVE' ? reviewedAt : null,
          completedAt: input.decision === 'APPROVE' ? reviewedAt : null,
          updatedAt: reviewedAt,
        })
        .where(eq(verificationSessions.id, id));
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorName: admin.name,
        action:
          input.decision === 'APPROVE'
            ? 'MANUAL_REVIEW_APPROVED'
            : input.decision === 'REJECT'
              ? 'MANUAL_REVIEW_REJECTED'
              : 'MANUAL_REVIEW_COMPLETED',
        entityType: 'REVIEW',
        entityId: id,
        before: { status: detail.session.verificationStatus },
        after: { status: nextStatus, decision: input.decision, reasonCode: input.reasonCode },
        reason: input.reviewNote,
        timestamp: reviewedAt,
      });
      if (input.decision === 'APPROVE') {
        await tx
          .update(customerAddresses)
          .set({
            addressStatus: 'SUPERSEDED',
            addressType: 'HISTORICAL',
            isActive: false,
            validTo: reviewedAt,
            updatedAt: reviewedAt,
          })
          .where(
            and(
              eq(customerAddresses.customerId, detail.customer.id),
              eq(customerAddresses.isActive, true),
              ne(customerAddresses.id, detail.address.id),
            ),
          );
        const approvedResult = detail.results[0];
        await tx
          .update(customerAddresses)
          .set({
            // Manual approval turns the captured, reviewed GPS point into the
            // durable reference for the verified installation address.
            ...(approvedResult
              ? buildVerifiedAddressReference(
                  Number(approvedResult.capturedLatitude),
                  Number(approvedResult.capturedLongitude),
                )
              : {}),
            isVerified: true,
            addressStatus: 'VERIFIED',
            addressType: 'VERIFIED_INSTALLATION',
            updatedAt: reviewedAt,
          })
          .where(eq(customerAddresses.id, detail.address.id));
        await tx
          .update(customers)
          .set({ status: 'VERIFIED', updatedAt: reviewedAt })
          .where(eq(customers.id, detail.customer.id));
        const eventId = randomUUID();
        await tx
          .insert(integrationOutbox)
          .values({
            id: randomUUID(),
            eventId,
            eventType: 'location.verified.v1',
            aggregateType: 'VERIFICATION_SESSION',
            aggregateId: id,
            correlationId: id,
            idempotencyKey: `location-verified:${id}`,
            payload: {
              eventId,
              eventType: 'location.verified.v1',
              occurredAt: reviewedAt.toISOString(),
              correlationId: id,
              idempotencyKey: `location-verified:${id}`,
              customer: { externalId: detail.customer.externalId, name: detail.customer.name },
              verifiedAddress: { addressId: detail.address.id, fullAddress: detail.address.rawAddress },
              verifiedLocation: {
                latitude: Number(detail.results[0].capturedLatitude),
                longitude: Number(detail.results[0].capturedLongitude),
                accuracyMeters: Number(detail.results[0].gpsAccuracyMeters),
                verifiedAt: reviewedAt.toISOString(),
              },
            },
            status: 'PENDING',
            attemptCount: 0,
            createdAt: reviewedAt,
            updatedAt: reviewedAt,
          })
          .onConflictDoNothing({ target: integrationOutbox.idempotencyKey });
      }
    });
    return { status: nextStatus };
  }

  async reminders(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          sql`${reminders.sessionId}::text ilike ${pattern}`,
          ilike(customers.name, pattern),
          ilike(customers.externalId, pattern),
          ilike(verificationSessions.registeredPhoneSnapshot, pattern),
        ),
      );
    }
    if (query.status) filters.push(eq(reminders.status, query.status as typeof reminders.$inferSelect.status));
    const where = and(...filters);
    const cachedCount = await this.readCache.count(
      'reminders',
      { search: query.search, status: query.status },
      async () => {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(reminders)
          .innerJoin(verificationSessions, eq(verificationSessions.id, reminders.sessionId))
          .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
          .where(where);
        return Number(total);
      },
    );
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(reminders.createdAt, new Date(cursor.value)),
          and(eq(reminders.createdAt, new Date(cursor.value)), lt(reminders.id, cursor.id)),
        )
      : undefined;
    const rows = await db
      .select({ reminder: reminders, session: verificationSessions, customer: customers })
      .from(reminders)
      .innerJoin(verificationSessions, eq(verificationSessions.id, reminders.sessionId))
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(desc(reminders.createdAt), desc(reminders.id))
      .offset(cursor ? 0 : (query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    return {
      items: rows.map(({ reminder, session, customer }) => ({
        ...reminder,
        session: sanitizeSession(session),
        customer,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: cachedCount.total,
      totalPages: Math.ceil(cachedCount.total / query.pageSize),
      nextCursor:
        rows.length === query.pageSize
          ? encodeListCursor(rows[rows.length - 1].reminder.createdAt, rows[rows.length - 1].reminder.id)
          : null,
      hasMore: rows.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
    };
  }

  async audits(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          ilike(auditLogs.action, pattern),
          ilike(auditLogs.actorName, pattern),
          ilike(auditLogs.entityId, pattern),
          ilike(auditLogs.reason, pattern),
        ),
      );
    }
    if (query.status) filters.push(eq(auditLogs.entityType, query.status as typeof auditLogs.$inferSelect.entityType));
    if (query.actor === 'CUSTOMER') filters.push(inArray(auditLogs.actorUserId, customerAuditActorIds));
    if (query.actor === 'SYSTEM') filters.push(inArray(auditLogs.actorUserId, systemAuditActorIds));
    if (query.actor === 'ADMIN')
      filters.push(
        sql`${auditLogs.actorUserId} NOT IN (${sql.join(
          [...customerAuditActorIds, ...systemAuditActorIds].map((actorId) => sql`${actorId}`),
          sql`, `,
        )})`,
      );
    const where = and(...filters);
    const cachedCount = await this.readCache.count(
      'audit-logs',
      { search: query.search, status: query.status, actor: query.actor },
      async () => {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(auditLogs)
          .where(where);
        return Number(total);
      },
    );
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(auditLogs.timestamp, new Date(cursor.value)),
          and(eq(auditLogs.timestamp, new Date(cursor.value)), lt(auditLogs.id, cursor.id)),
        )
      : undefined;
    const items = await db
      .select()
      .from(auditLogs)
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(desc(auditLogs.timestamp), desc(auditLogs.id))
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
          ? encodeListCursor(items[items.length - 1].timestamp, items[items.length - 1].id)
          : null,
      hasMore: items.length === query.pageSize,
      countAsOf: cachedCount.countAsOf,
    };
  }

  async settings() {
    return this.validationConfig.get();
  }

  async updateSettings(admin: RequestAdmin, input: ValidationConfigInput) {
    if (admin.role !== 'SUPER_ADMIN')
      throw new DomainError('Only SUPER_ADMIN can change validation configuration', 403, 'FORBIDDEN');
    const values = await this.validationConfig.update(admin.id, input);
    await db.insert(auditLogs).values({
      actorUserId: admin.id,
      actorName: admin.name,
      action: 'CONFIG_UPDATED',
      entityType: 'CONFIG',
      entityId: 'validation_rules',
      after: input,
      timestamp: timestamp(),
    });
    return values;
  }

  async integrations() {
    return db.select().from(integrationConfigs).orderBy(integrationConfigs.key);
  }
  async outbox(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(
        or(
          ilike(integrationOutbox.eventType, pattern),
          ilike(integrationOutbox.aggregateId, pattern),
          ilike(integrationOutbox.correlationId, pattern),
          ilike(integrationOutbox.idempotencyKey, pattern),
        ),
      );
    }
    if (query.status)
      filters.push(eq(integrationOutbox.status, query.status as typeof integrationOutbox.$inferSelect.status));
    const where = and(...filters);
    const cachedCount = await this.readCache.count(
      'outbox',
      { search: query.search, status: query.status },
      async () => {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(integrationOutbox)
          .where(where);
        return Number(total);
      },
    );
    const cursor = decodeListCursor(query.cursor);
    const cursorWhere = cursor
      ? or(
          lt(integrationOutbox.createdAt, new Date(cursor.value)),
          and(eq(integrationOutbox.createdAt, new Date(cursor.value)), lt(integrationOutbox.id, cursor.id)),
        )
      : undefined;
    const items = await db
      .select()
      .from(integrationOutbox)
      .where(cursorWhere ? and(where, cursorWhere) : where)
      .orderBy(desc(integrationOutbox.createdAt), desc(integrationOutbox.id))
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

  private async assertManualSendAllowed(phoneE164: string) {
    const [last] = await db
      .select({ sentAt: whatsappDeliveryLogs.sentAt })
      .from(whatsappDeliveryLogs)
      .where(eq(whatsappDeliveryLogs.phoneHash, hashPhone(phoneE164)))
      .orderBy(desc(whatsappDeliveryLogs.sentAt))
      .limit(1);
    const retryAt = nextAllowedSendAt(last?.sentAt ?? null, Number(process.env.WHATSAPP_MIN_INTERVAL_MINUTES ?? 60));
    if (retryAt)
      throw new DomainError(`WhatsApp cooldown active until ${retryAt.toISOString()}`, 429, 'WHATSAPP_COOLDOWN');
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [daily] = await db
      .select({ total: sql<number>`count(*)` })
      .from(whatsappDeliveryLogs)
      .where(sql`${whatsappDeliveryLogs.sentAt} >= ${dayStart}`);
    if (Number(daily.total) >= Number(process.env.WHATSAPP_DAILY_SEND_LIMIT ?? 1000))
      throw new DomainError('WhatsApp daily send limit reached', 429, 'WHATSAPP_DAILY_LIMIT_REACHED');
  }

  private async recordManualDelivery(
    phoneE164: string,
    idempotencyKey: string,
    messageType: string,
    providerMessageId: string,
  ) {
    await db
      .insert(whatsappDeliveryLogs)
      .values({
        id: randomUUID(),
        phoneHash: hashPhone(phoneE164),
        messageType,
        idempotencyKey,
        providerMessageId,
        status: 'ACCEPTED',
        sentAt: new Date(),
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: whatsappDeliveryLogs.idempotencyKey });
  }
}
