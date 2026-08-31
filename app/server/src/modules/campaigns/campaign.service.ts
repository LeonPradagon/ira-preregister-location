import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { auditLogs, customerAddresses, customers, verificationCampaignItems, verificationCampaigns, verificationSessions } from '../../db/schema/index.js';
import { AdminListQueryInput, CampaignCreateInput } from '../../common/contracts.js';
import { DomainError, NotFoundError } from '../../common/errors.js';
import { RequestAdmin } from '../../common/request-user.js';
import { ValidationConfigService } from '../../config/validation-config.service.js';
import { hashVerificationSecret } from '../verification/verification-token.js';

const timestamp = () => new Date();
const canManage = (role: RequestAdmin['role']) => role === 'SUPER_ADMIN' || role === 'ADMIN';

@Injectable()
export class CampaignService {
  constructor(private readonly validationConfig: ValidationConfigService) {}

  async create(admin: RequestAdmin, input: CampaignCreateInput) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot create a campaign', 403, 'FORBIDDEN');
    const config = await this.validationConfig.get();
    if (input.customerIds.length > Number(process.env.CAMPAIGN_MAX_BATCH_SIZE ?? 10000)) {
      throw new DomainError('Campaign batch is too large', 413, 'CAMPAIGN_BATCH_TOO_LARGE');
    }
    const selectedCustomers = await db.select().from(customers).where(inArray(customers.id, input.customerIds));
    if (selectedCustomers.length !== input.customerIds.length) throw new DomainError('One or more campaign customers were not found', 422, 'CAMPAIGN_TARGET_INVALID');
    if (selectedCustomers.some((customer) => customer.whatsappOptOutAt)) throw new DomainError('One or more campaign customers have opted out of WhatsApp messages', 422, 'CUSTOMER_OPTED_OUT');
    const selectedAddresses = await db.select().from(customerAddresses).where(and(inArray(customerAddresses.customerId, input.customerIds), eq(customerAddresses.isActive, true)));
    const addressByCustomer = new Map<string, typeof selectedAddresses[number]>();
    for (const address of selectedAddresses) if (!addressByCustomer.has(address.customerId)) addressByCustomer.set(address.customerId, address);
    const targets = selectedCustomers.map((customer) => ({ customer, address: addressByCustomer.get(customer.id) })).filter((target): target is { customer: typeof selectedCustomers[number]; address: typeof selectedAddresses[number] } => Boolean(target.address));
    if (targets.length !== input.customerIds.length) throw new DomainError('One or more customers do not have an active address', 422, 'CAMPAIGN_TARGET_INVALID');

    const campaignId = randomUUID();
    const created = timestamp();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : created;
    const expiresAt = new Date(scheduledAt.getTime() + config.VERIFICATION_TOKEN_TTL_DAYS * 86400000);
    await db.transaction(async (tx) => {
      await tx.insert(verificationCampaigns).values({ id: campaignId, name: input.name, status: 'DRAFT', timezone: input.timezone, scheduledAt, targetCount: targets.length, sentCount: 0, failedCount: 0, createdBy: admin.id, createdAt: created, updatedAt: created });
      const sessions = await Promise.all(targets.map(async ({ customer, address }) => ({ id: randomUUID(), campaignId, customerId: customer.id, currentAddressId: address.id, tokenHash: await hashVerificationSecret(randomBytes(32).toString('base64url')), expiresAt, verificationStatus: 'CREATED', customerConfirmationStatus: 'UNCONFIRMED', registeredPhoneSnapshot: customer.phoneE164, createdAt: created, updatedAt: created })));
      await tx.insert(verificationSessions).values(sessions);
      await tx.insert(verificationCampaignItems).values(targets.map(({ customer, address }, index) => ({ id: randomUUID(), campaignId, customerId: customer.id, addressId: address.id, sessionId: sessions[index].id, status: 'PENDING', scheduledAt, retryCount: 0, createdAt: created, updatedAt: created })));
      await tx.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'CAMPAIGN_CREATED', entityType: 'CAMPAIGN', entityId: campaignId, after: { targetCount: targets.length, timezone: input.timezone, scheduledAt: scheduledAt.toISOString() }, timestamp: created });
    });
    return { id: campaignId, name: input.name, status: 'DRAFT', timezone: input.timezone, scheduledAt, targetCount: targets.length, sentCount: 0, failedCount: 0 };
  }

  async start(admin: RequestAdmin, campaignId: string) {
    if (!canManage(admin.role)) throw new DomainError('Role cannot start a campaign', 403, 'FORBIDDEN');
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (campaign.status !== 'DRAFT') throw new DomainError('Campaign is not in draft state', 409, 'CAMPAIGN_NOT_DRAFT');
    const updatedAt = timestamp();
    await db.transaction(async (tx) => {
      await tx.update(verificationCampaigns).set({ status: 'RUNNING', updatedAt }).where(eq(verificationCampaigns.id, campaignId));
      await tx.insert(auditLogs).values({ actorUserId: admin.id, actorName: admin.name, action: 'CAMPAIGN_STARTED', entityType: 'CAMPAIGN', entityId: campaignId, before: { status: 'DRAFT' }, after: { status: 'RUNNING' }, timestamp: updatedAt });
    });
    return { id: campaignId, status: 'RUNNING' };
  }

  async list(query: AdminListQueryInput) {
    const filters = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      filters.push(or(ilike(verificationCampaigns.name, pattern), sql`${verificationCampaigns.id}::text ilike ${pattern}`));
    }
    if (query.status) filters.push(eq(verificationCampaigns.status, query.status as typeof verificationCampaigns.$inferSelect.status));
    const where = and(...filters);
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(verificationCampaigns).where(where);
    const items = await db.select().from(verificationCampaigns).where(where).orderBy(desc(verificationCampaigns.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return { items, page: query.page, pageSize: query.pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / query.pageSize) };
  }

  async detail(campaignId: string) {
    const [campaign] = await db.select().from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    const items = await this.items(campaignId);
    return { campaign, items };
  }

  async items(campaignId: string) {
    const [campaign] = await db.select({ id: verificationCampaigns.id }).from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
    if (!campaign) throw new NotFoundError('Campaign not found');
    return db.select({ item: verificationCampaignItems, customer: customers, sessionStatus: verificationSessions.verificationStatus })
      .from(verificationCampaignItems)
      .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
      .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
      .where(eq(verificationCampaignItems.campaignId, campaignId))
      .orderBy(desc(verificationCampaignItems.createdAt));
  }

  async refreshStatus(campaignId: string) {
    const [counts] = await db.select({ sent: sql<number>`count(*) filter (where ${verificationCampaignItems.status} = 'SENT')`, failed: sql<number>`count(*) filter (where ${verificationCampaignItems.status} = 'FAILED')`, pending: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('PENDING', 'PROCESSING'))` }).from(verificationCampaignItems).where(eq(verificationCampaignItems.campaignId, campaignId));
    const status = Number(counts.pending) === 0 ? 'COMPLETED' : 'RUNNING';
    await db.update(verificationCampaigns).set({ sentCount: Number(counts.sent), failedCount: Number(counts.failed), status, updatedAt: timestamp() }).where(eq(verificationCampaigns.id, campaignId));
  }
}
