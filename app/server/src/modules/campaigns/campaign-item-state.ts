import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { verificationCampaignItems, verificationCampaigns } from '../../db/schema/index.js';

export type CampaignDeliveryStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

/**
 * All campaign item state changes go through this module so counters remain
 * atomic and duplicate queue/webhook deliveries are harmless.
 */
export class CampaignItemState {
  static async claim(itemId: string) {
    const [item] = await db
      .update(verificationCampaignItems)
      .set({ status: 'PROCESSING', processingStartedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(verificationCampaignItems.id, itemId), eq(verificationCampaignItems.status, 'PENDING')))
      .returning();
    return item ?? null;
  }

  static async markSent(itemId: string, providerMessageId: string, sentAt: Date) {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .update(verificationCampaignItems)
        .set({
          status: 'SENT',
          sentAt,
          providerMessageId,
          processingStartedAt: null,
          lastError: null,
          updatedAt: sentAt,
        })
        .where(and(eq(verificationCampaignItems.id, itemId), eq(verificationCampaignItems.status, 'PROCESSING')))
        .returning({ id: verificationCampaignItems.id, campaignId: verificationCampaignItems.campaignId });
      if (!item) return null;
      await tx
        .update(verificationCampaigns)
        .set({ sentCount: sql`${verificationCampaigns.sentCount} + 1`, updatedAt: sentAt })
        .where(eq(verificationCampaigns.id, item.campaignId));
      return item;
    });
  }

  static async markFailure(itemId: string, retryCount: number, terminal: boolean, error: string, failedAt: Date) {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .update(verificationCampaignItems)
        .set({
          status: terminal ? 'PROVIDER_UNAVAILABLE' : 'PENDING',
          retryCount,
          scheduledAt: terminal ? undefined : new Date(failedAt.getTime() + retryCount * 60 * 1000),
          lastError: error,
          failedAt: terminal ? failedAt : null,
          processingStartedAt: null,
          updatedAt: failedAt,
        })
        .where(and(eq(verificationCampaignItems.id, itemId), eq(verificationCampaignItems.status, 'PROCESSING')))
        .returning({ id: verificationCampaignItems.id, campaignId: verificationCampaignItems.campaignId });
      if (!item || !terminal) return item ?? null;
      await tx
        .update(verificationCampaigns)
        .set({ failedCount: sql`${verificationCampaigns.failedCount} + 1`, updatedAt: failedAt })
        .where(eq(verificationCampaigns.id, item.campaignId));
      return item;
    });
  }

  static async markOptedOut(itemId: string, changedAt: Date) {
    return db.transaction(async (tx) => {
      const [item] = await tx
        .update(verificationCampaignItems)
        .set({
          status: 'OPTED_OUT',
          processingStartedAt: null,
          lastError: 'CUSTOMER_OPTED_OUT',
          failedAt: changedAt,
          updatedAt: changedAt,
        })
        .where(
          and(
            eq(verificationCampaignItems.id, itemId),
            inArray(verificationCampaignItems.status, ['PENDING', 'PROCESSING']),
          ),
        )
        .returning({ id: verificationCampaignItems.id, campaignId: verificationCampaignItems.campaignId });
      if (!item) return null;
      await tx
        .update(verificationCampaigns)
        .set({
          failedCount: sql`${verificationCampaigns.failedCount} + 1`,
          optedOutCount: sql`${verificationCampaigns.optedOutCount} + 1`,
          updatedAt: changedAt,
        })
        .where(eq(verificationCampaigns.id, item.campaignId));
      return item;
    });
  }

  static async applyDeliveryStatus(providerMessageId: string, status: CampaignDeliveryStatus, occurredAt: Date) {
    const previousStatuses =
      status === 'DELIVERED'
        ? ['SENT']
        : status === 'READ'
          ? ['SENT', 'DELIVERED']
          : status === 'FAILED'
            ? ['SENT', 'DELIVERED', 'READ']
            : [];
    if (!previousStatuses.length) return null;
    return db.transaction(async (tx) => {
      const [item] = await tx
        .update(verificationCampaignItems)
        .set(
          status === 'DELIVERED'
            ? { status: 'DELIVERED', deliveredAt: occurredAt, updatedAt: occurredAt }
            : status === 'READ'
              ? { status: 'READ', readAt: occurredAt, updatedAt: occurredAt }
              : {
                  status: 'FAILED',
                  processingStartedAt: null,
                  failedAt: occurredAt,
                  lastError: 'PROVIDER_REPORTED_FAILURE',
                  updatedAt: occurredAt,
                },
        )
        .where(
          and(
            eq(verificationCampaignItems.providerMessageId, providerMessageId),
            inArray(verificationCampaignItems.status, previousStatuses),
          ),
        )
        .returning({ id: verificationCampaignItems.id, campaignId: verificationCampaignItems.campaignId });
      if (!item) return null;
      if (status === 'FAILED')
        await tx
          .update(verificationCampaigns)
          .set({ failedCount: sql`${verificationCampaigns.failedCount} + 1`, updatedAt: occurredAt })
          .where(eq(verificationCampaigns.id, item.campaignId));
      return item;
    });
  }

  static async reconcile(campaignId: string) {
    const [counts] = await db
      .select({
        sent: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('SENT', 'DELIVERED', 'READ'))`,
        failed: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('FAILED', 'PROVIDER_UNAVAILABLE', 'OPTED_OUT'))`,
        optedOut: sql<number>`count(*) filter (where ${verificationCampaignItems.status} = 'OPTED_OUT')`,
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
    const nextStatus =
      campaign.status === 'PAUSED'
        ? 'PAUSED'
        : campaign.materializationComplete && Number(counts.pending) === 0
          ? 'COMPLETED'
          : 'RUNNING';
    await db
      .update(verificationCampaigns)
      .set({
        sentCount: Number(counts.sent),
        failedCount: Number(counts.failed),
        optedOutCount: Number(counts.optedOut),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(verificationCampaigns.id, campaignId));
  }
}
