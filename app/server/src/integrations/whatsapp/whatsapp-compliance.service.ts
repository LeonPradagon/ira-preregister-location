import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  auditLogs,
  customers,
  reminders,
  verificationCampaignItems,
  verificationCampaigns,
  whatsappDeliveryLogs,
} from '../../db/schema/index.js';
import { NotFoundError } from '../../common/errors.js';
import { hashPhone, isOptOutMessage } from './whatsapp.policy.js';
import { classifyWhatsAppFailure, formatWhatsAppProviderError } from './whatsapp-status.js';
import { CampaignItemState } from '../../modules/campaigns/campaign-item-state.js';
import { reminderCancellationAudit, reminderCancellationFields } from '../../modules/reminders/reminder.policy.js';

@Injectable()
export class WhatsAppComplianceService {
  async recordDeliveryStatus(input: {
    providerMessageId: string;
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    error?: string;
    errorCode?: string;
    occurredAt?: string;
  }) {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) return { accepted: false, reason: 'INVALID_TIMESTAMP' };
    const customerStatus =
      input.status === 'FAILED' ? classifyWhatsAppFailure(input) : input.status === 'SENT' ? 'ACCEPTED' : input.status;
    const providerError = input.status === 'FAILED' ? formatWhatsAppProviderError(input) : null;
    const [delivery] = await db
      .update(whatsappDeliveryLogs)
      .set({
        status: input.status,
        deliveredAt: input.status === 'DELIVERED' ? occurredAt : undefined,
        readAt: input.status === 'READ' ? occurredAt : undefined,
        failedAt: input.status === 'FAILED' ? occurredAt : undefined,
        providerErrorCode: input.errorCode ?? null,
        lastError: providerError,
      })
      .where(eq(whatsappDeliveryLogs.providerMessageId, input.providerMessageId))
      .returning({ id: whatsappDeliveryLogs.id, customerId: whatsappDeliveryLogs.customerId });
    if (delivery?.customerId) {
      await db
        .update(customers)
        .set({
          whatsappStatus: customerStatus,
          updatedAt: occurredAt,
        })
        .where(eq(customers.id, delivery.customerId));
    }
    const campaignItem = await CampaignItemState.applyDeliveryStatus(input.providerMessageId, input.status, occurredAt);
    const [reminder] = await db
      .update(reminders)
      .set({ status: input.status === 'FAILED' ? 'FAILED' : 'SENT', processingStartedAt: null })
      .where(eq(reminders.providerMessageId, input.providerMessageId))
      .returning({ id: reminders.id });
    if (delivery || campaignItem || reminder) {
      await db.insert(auditLogs).values({
        actorUserId: 'whatsapp-webhook',
        actorName: 'WhatsApp Provider',
        action: `WHATSAPP_${customerStatus}`,
        entityType: campaignItem ? 'CAMPAIGN_ITEM' : reminder ? 'REMINDER' : 'DELIVERY',
        entityId: campaignItem?.id ?? reminder?.id ?? delivery?.id ?? input.providerMessageId,
        after: {
          providerMessageId: input.providerMessageId,
          status: input.status,
          customerStatus,
          errorCode: input.errorCode,
          error: providerError,
        },
        timestamp: occurredAt,
      });
    }
    return { accepted: true, matched: Boolean(delivery || campaignItem || reminder) };
  }

  async recordInbound(phoneE164: string, text: string) {
    if (!isOptOutMessage(text)) return { optedOut: false };
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phoneE164, phoneE164))
      .limit(1);
    if (!customer) return { optedOut: true, matched: false };
    const changedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ whatsappOptOutAt: changedAt, updatedAt: changedAt })
        .where(eq(customers.id, customer.id));
      const cancelledReminders = await tx
        .update(reminders)
        .set({
          ...reminderCancellationFields('CUSTOMER_OPTED_OUT', changedAt, 'whatsapp-inbound'),
          processingStartedAt: null,
        })
        .where(
          and(
            eq(reminders.status, 'SCHEDULED'),
            sql`${reminders.sessionId} in (select id from verification_sessions where customer_id = ${customer.id})`,
          ),
        )
        .returning({ id: reminders.id });
      if (cancelledReminders.length)
        await tx.insert(auditLogs).values(
          cancelledReminders.map(({ id }) =>
            reminderCancellationAudit(id, 'CUSTOMER_OPTED_OUT', changedAt, 'whatsapp-inbound', 'WhatsApp'),
          ),
        );
      const optedOutItems = await tx
        .update(verificationCampaignItems)
        .set({ status: 'OPTED_OUT', lastError: 'CUSTOMER_OPTED_OUT', failedAt: changedAt, updatedAt: changedAt })
        .where(
          and(eq(verificationCampaignItems.status, 'PENDING'), eq(verificationCampaignItems.customerId, customer.id)),
        )
        .returning({ campaignId: verificationCampaignItems.campaignId });
      for (const campaignId of new Set(optedOutItems.map((item) => item.campaignId))) {
        const count = optedOutItems.filter((item) => item.campaignId === campaignId).length;
        await tx
          .update(verificationCampaigns)
          .set({
            failedCount: sql`${verificationCampaigns.failedCount} + ${count}`,
            optedOutCount: sql`${verificationCampaigns.optedOutCount} + ${count}`,
            updatedAt: changedAt,
          })
          .where(eq(verificationCampaigns.id, campaignId));
      }
      await tx.insert(auditLogs).values({
        actorUserId: 'whatsapp-inbound',
        actorName: 'WhatsApp',
        action: 'WHATSAPP_OPTED_OUT',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        after: { phoneHash: hashPhone(phoneE164), source: 'inbound_keyword' },
        timestamp: changedAt,
      });
    });
    return { optedOut: true, matched: true };
  }

  async optOut(adminId: string, customerId: string) {
    const [customer] = await db
      .select({ id: customers.id, phoneE164: customers.phoneE164 })
      .from(customers)
      .where(eq(customers.id, customerId));
    if (!customer) throw new NotFoundError('Customer not found');
    const changedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({ whatsappOptOutAt: changedAt, updatedAt: changedAt })
        .where(eq(customers.id, customerId));
      const cancelledReminders = await tx
        .update(reminders)
        .set({
          ...reminderCancellationFields('CUSTOMER_OPTED_OUT', changedAt, adminId),
          processingStartedAt: null,
        })
        .where(
          and(
            eq(reminders.status, 'SCHEDULED'),
            sql`${reminders.sessionId} in (select id from verification_sessions where customer_id = ${customer.id})`,
          ),
        )
        .returning({ id: reminders.id });
      if (cancelledReminders.length)
        await tx.insert(auditLogs).values(
          cancelledReminders.map(({ id }) =>
            reminderCancellationAudit(id, 'CUSTOMER_OPTED_OUT', changedAt, adminId, 'Admin'),
          ),
        );
      const optedOutItems = await tx
        .update(verificationCampaignItems)
        .set({ status: 'OPTED_OUT', lastError: 'CUSTOMER_OPTED_OUT', failedAt: changedAt, updatedAt: changedAt })
        .where(
          and(eq(verificationCampaignItems.status, 'PENDING'), eq(verificationCampaignItems.customerId, customer.id)),
        )
        .returning({ campaignId: verificationCampaignItems.campaignId });
      for (const campaignId of new Set(optedOutItems.map((item) => item.campaignId))) {
        const count = optedOutItems.filter((item) => item.campaignId === campaignId).length;
        await tx
          .update(verificationCampaigns)
          .set({
            failedCount: sql`${verificationCampaigns.failedCount} + ${count}`,
            optedOutCount: sql`${verificationCampaigns.optedOutCount} + ${count}`,
            updatedAt: changedAt,
          })
          .where(eq(verificationCampaigns.id, campaignId));
      }
      await tx.insert(auditLogs).values({
        actorUserId: adminId,
        actorName: 'Admin',
        action: 'WHATSAPP_OPTED_OUT',
        entityType: 'CUSTOMER',
        entityId: customerId,
        after: { phoneHash: hashPhone(customer.phoneE164), source: 'admin' },
        timestamp: changedAt,
      });
    });
    return { customerId, status: 'OPTED_OUT' };
  }
}
