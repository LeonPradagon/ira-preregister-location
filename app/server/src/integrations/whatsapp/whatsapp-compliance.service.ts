import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs, customers, reminders, verificationCampaignItems } from '../../db/schema/index.js';
import { NotFoundError } from '../../common/errors.js';
import { hashPhone, isOptOutMessage } from './whatsapp.policy.js';

@Injectable()
export class WhatsAppComplianceService {
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
