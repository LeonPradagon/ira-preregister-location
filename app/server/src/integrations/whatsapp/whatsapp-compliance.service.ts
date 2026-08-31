import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, customers, reminders, verificationCampaignItems, verificationCampaigns, whatsappDeliveryLogs } from '../../db/schema/index.js';
import { NotFoundError } from '../../common/errors.js';
import { hashPhone, isOptOutMessage } from './whatsapp.policy.js';

@Injectable()
export class WhatsAppComplianceService {
  async recordDeliveryStatus(input: { providerMessageId: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; error?: string; occurredAt?: string }) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return { accepted: false, reason: 'INVALID_TIMESTAMP' };
    const [delivery] = await db.update(whatsappDeliveryLogs).set({
      status: input.status,
      deliveredAt: input.status === 'DELIVERED' ? occurredAt : undefined,
      readAt: input.status === 'READ' ? occurredAt : undefined,
      failedAt: input.status === 'FAILED' ? occurredAt : undefined,
      lastError: input.status === 'FAILED' ? input.error ?? 'PROVIDER_REPORTED_FAILURE' : null,
    }).where(eq(whatsappDeliveryLogs.providerMessageId, input.providerMessageId)).returning({ id: whatsappDeliveryLogs.id });
    const itemStatus = input.status === 'FAILED' ? 'FAILED' : input.status;
    const itemSet = input.status === 'DELIVERED'
      ? { status: itemStatus, deliveredAt: occurredAt, updatedAt: occurredAt }
      : input.status === 'READ'
        ? { status: itemStatus, readAt: occurredAt, updatedAt: occurredAt }
        : input.status === 'FAILED'
          ? { status: itemStatus, failedAt: occurredAt, lastError: input.error ?? 'PROVIDER_REPORTED_FAILURE', updatedAt: occurredAt }
          : { status: itemStatus, updatedAt: occurredAt };
    const [campaignItem] = await db.update(verificationCampaignItems).set(itemSet).where(eq(verificationCampaignItems.providerMessageId, input.providerMessageId)).returning({ id: verificationCampaignItems.id, campaignId: verificationCampaignItems.campaignId });
    const [reminder] = await db.update(reminders).set({ status: input.status === 'FAILED' ? 'FAILED' : 'SENT' }).where(eq(reminders.providerMessageId, input.providerMessageId)).returning({ id: reminders.id });
    if (delivery || campaignItem || reminder) {
      await db.insert(auditLogs).values({ actorUserId: 'whatsapp-webhook', actorName: 'WhatsApp Provider', action: `WHATSAPP_${input.status}`, entityType: campaignItem ? 'CAMPAIGN_ITEM' : reminder ? 'REMINDER' : 'DELIVERY', entityId: campaignItem?.id ?? reminder?.id ?? delivery?.id ?? input.providerMessageId, after: { providerMessageId: input.providerMessageId, status: input.status, error: input.status === 'FAILED' ? input.error : undefined }, timestamp: occurredAt });
    }
    if (campaignItem) {
      const [counts] = await db.select({
        sent: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('SENT', 'DELIVERED', 'READ'))`,
        failed: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('FAILED', 'PROVIDER_UNAVAILABLE', 'OPTED_OUT'))`,
      }).from(verificationCampaignItems).where(eq(verificationCampaignItems.campaignId, campaignItem.campaignId));
      await db.update(verificationCampaigns).set({ sentCount: Number(counts.sent), failedCount: Number(counts.failed), updatedAt: occurredAt }).where(eq(verificationCampaigns.id, campaignItem.campaignId));
    }
    return { accepted: true, matched: Boolean(delivery || campaignItem || reminder) };
  }

  async recordInbound(phoneE164: string, text: string) {
    if (!isOptOutMessage(text)) return { optedOut: false };
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.phoneE164, phoneE164)).limit(1);
    if (!customer) return { optedOut: true, matched: false };
    const changedAt = new Date();
    await db.transaction(async (tx) => {
      await tx.update(customers).set({ whatsappOptOutAt: changedAt, updatedAt: changedAt }).where(eq(customers.id, customer.id));
      await tx.update(reminders).set({ status: 'CANCELLED' }).where(and(eq(reminders.status, 'SCHEDULED'), sql`${reminders.sessionId} in (select id from verification_sessions where customer_id = ${customer.id})`));
      await tx.update(verificationCampaignItems).set({ status: 'OPTED_OUT', lastError: 'CUSTOMER_OPTED_OUT', updatedAt: changedAt }).where(and(eq(verificationCampaignItems.status, 'PENDING'), eq(verificationCampaignItems.customerId, customer.id)));
      await tx.insert(auditLogs).values({ actorUserId: 'whatsapp-inbound', actorName: 'WhatsApp', action: 'WHATSAPP_OPTED_OUT', entityType: 'CUSTOMER', entityId: customer.id, after: { phoneHash: hashPhone(phoneE164), source: 'inbound_keyword' }, timestamp: changedAt });
    });
    return { optedOut: true, matched: true };
  }

  async optOut(adminId: string, customerId: string) {
    const [customer] = await db.select({ id: customers.id, phoneE164: customers.phoneE164 }).from(customers).where(eq(customers.id, customerId));
    if (!customer) throw new NotFoundError('Customer not found');
    const changedAt = new Date();
    await db.transaction(async (tx) => {
      await tx.update(customers).set({ whatsappOptOutAt: changedAt, updatedAt: changedAt }).where(eq(customers.id, customerId));
      await tx.update(reminders).set({ status: 'CANCELLED' }).where(and(eq(reminders.status, 'SCHEDULED'), sql`${reminders.sessionId} in (select id from verification_sessions where customer_id = ${customer.id})`));
      await tx.update(verificationCampaignItems).set({ status: 'OPTED_OUT', lastError: 'CUSTOMER_OPTED_OUT', updatedAt: changedAt }).where(and(eq(verificationCampaignItems.status, 'PENDING'), eq(verificationCampaignItems.customerId, customer.id)));
      await tx.insert(auditLogs).values({ actorUserId: adminId, actorName: 'Admin', action: 'WHATSAPP_OPTED_OUT', entityType: 'CUSTOMER', entityId: customerId, after: { phoneHash: hashPhone(customer.phoneE164), source: 'admin' }, timestamp: changedAt });
    });
    return { customerId, status: 'OPTED_OUT' };
  }
}
