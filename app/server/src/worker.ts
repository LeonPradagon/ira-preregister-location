import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { and, desc, eq, gte, isNull, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { db, pool } from './db/client.js';
import { auditLogs, customers, integrationOutbox, reminders, verificationCampaignItems, verificationCampaigns, verificationSessions, whatsappDeliveryLogs } from './db/schema/index.js';
import { ConsoleWhatsAppAdapter } from './integrations/whatsapp/console-whatsapp.adapter.js';
import { HttpWhatsAppAdapter } from './integrations/whatsapp/http-whatsapp.adapter.js';
import { DisabledWhatsAppAdapter } from './integrations/whatsapp/disabled-whatsapp.adapter.js';
import { WhatsAppPort } from './integrations/whatsapp/whatsapp.port.js';
import { hashPhone, nextAllowedSendAt, nextUtcMidnight } from './integrations/whatsapp/whatsapp.policy.js';
import { createVerificationToken } from './modules/verification/verification-token.js';
import { CampaignService } from './modules/campaigns/campaign.service.js';
import { ValidationConfigService } from './config/validation-config.service.js';
import { getWhatsAppTemplate } from './integrations/whatsapp/whatsapp.templates.js';
import { reminderLinkExpiresAt } from './modules/reminders/reminder.policy.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const outboxQueueName = 'exact-location-outbox';
const reminderQueueName = 'exact-location-reminders';
const campaignQueueName = 'exact-location-campaigns';
const outboxQueue = new Queue(outboxQueueName, { connection });
const reminderQueue = new Queue(reminderQueueName, { connection });
const campaignQueue = new Queue(campaignQueueName, { connection });
const whatsappProvider = process.env.WHATSAPP_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'disabled' : 'generic');
const invitationTemplate = getWhatsAppTemplate('INVITATION');
const reminderTemplate = getWhatsAppTemplate('REMINDER');
const whatsapp: WhatsAppPort = whatsappProvider === 'disabled' || whatsappProvider === 'mekari'
  ? new DisabledWhatsAppAdapter()
  : process.env.WHATSAPP_BASE_URL && (whatsappProvider === 'meta' || process.env.WHATSAPP_TEMPLATE_NAME || invitationTemplate.name || reminderTemplate.name)
    ? new HttpWhatsAppAdapter()
    : process.env.NODE_ENV === 'production'
      ? new DisabledWhatsAppAdapter()
      : new ConsoleWhatsAppAdapter();
const campaigns = new CampaignService(new ValidationConfigService());
const reminderConfig = new ValidationConfigService();

const circuitBucket = () => `whatsapp:outcomes:${Math.floor(Date.now() / 60000)}`;
const isCircuitOpen = async () => (await connection.get('whatsapp:circuit:open')) === '1';
const recordProviderOutcome = async (success: boolean) => {
  const key = circuitBucket();
  await connection.hincrby(key, 'attempts', 1);
  if (!success) await connection.hincrby(key, 'failures', 1);
  await connection.expire(key, 180);
  const attempts = Number(await connection.hget(key, 'attempts') ?? 0);
  const failures = Number(await connection.hget(key, 'failures') ?? 0);
  const minimum = Number(process.env.WHATSAPP_CIRCUIT_MIN_ATTEMPTS ?? 50);
  const ratio = Number(process.env.WHATSAPP_CIRCUIT_FAILURE_RATIO ?? 0.3);
  if (attempts >= minimum && failures / attempts >= ratio) await connection.set('whatsapp:circuit:open', '1', 'EX', Number(process.env.WHATSAPP_CIRCUIT_COOLDOWN_MINUTES ?? 15) * 60);
};

const dispatchSafety = async (phoneE164: string) => {
  const current = new Date();
  const dayStart = new Date(current);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [daily] = await db.select({ total: sql<number>`count(*)` }).from(whatsappDeliveryLogs).where(gte(whatsappDeliveryLogs.sentAt, dayStart));
  if (Number(daily.total) >= Number(process.env.WHATSAPP_DAILY_SEND_LIMIT ?? 10000)) return { allowed: false, retryAt: nextUtcMidnight(current) };
  const [last] = await db.select({ sentAt: whatsappDeliveryLogs.sentAt }).from(whatsappDeliveryLogs).where(eq(whatsappDeliveryLogs.phoneHash, hashPhone(phoneE164))).orderBy(desc(whatsappDeliveryLogs.sentAt)).limit(1);
  const retryAt = nextAllowedSendAt(last?.sentAt ?? null, Number(process.env.WHATSAPP_MIN_INTERVAL_MINUTES ?? 60), current);
  if (retryAt) return { allowed: false, retryAt };
  const cooldownKey = `whatsapp:cooldown:${hashPhone(phoneE164)}`;
  const cooldownSeconds = Number(process.env.WHATSAPP_MIN_INTERVAL_MINUTES ?? 60) * 60;
  const cooldownReserved = await connection.set(cooldownKey, '1', 'EX', cooldownSeconds, 'NX');
  if (!cooldownReserved) return { allowed: false, retryAt: new Date(current.getTime() + cooldownSeconds * 1000) };
  const dailyKey = `whatsapp:daily:${current.toISOString().slice(0, 10)}`;
  const dailyReservation = await connection.incr(dailyKey);
  if (dailyReservation === 1) await connection.expire(dailyKey, 172800);
  if (dailyReservation > Number(process.env.WHATSAPP_DAILY_SEND_LIMIT ?? 10000)) {
    await connection.decr(dailyKey);
    await connection.del(cooldownKey);
    return { allowed: false, retryAt: nextUtcMidnight(current) };
  }
  return { allowed: true, retryAt: null };
};

const recordDelivery = async (phoneE164: string, messageType: string, idempotencyKey: string, providerMessageId: string) => {
  await db.insert(whatsappDeliveryLogs).values({ id: randomUUID(), phoneHash: hashPhone(phoneE164), messageType, idempotencyKey, providerMessageId, status: 'ACCEPTED', sentAt: new Date(), createdAt: new Date() }).onConflictDoNothing({ target: whatsappDeliveryLogs.idempotencyKey });
};

const outboxWorker = new Worker(
  outboxQueueName,
  async (job) => {
    const outboxId = String(job.data.outboxId);
    const [event] = await db.select().from(integrationOutbox).where(eq(integrationOutbox.id, outboxId)).limit(1);
    if (!event || event.status === 'PUBLISHED') return;
    const processingAt = new Date();
    await db.update(integrationOutbox).set({ status: 'PROCESSING', attemptCount: event.attemptCount + 1, updatedAt: processingAt }).where(eq(integrationOutbox.id, outboxId));
    try {
      // Provider-specific consumers remain disabled until credentials are
      // configured. Publishing the durable event is still observable and safe.
      console.info('[outbox:published]', { eventId: event.eventId, eventType: event.eventType });
      await db.update(integrationOutbox).set({ status: 'PUBLISHED', sentAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(integrationOutbox.id, outboxId));
    } catch (error) {
      const retryAt = new Date(Date.now() + Math.min(5 * 60 * 1000, 1000 * (2 ** Math.min(event.attemptCount, 8))));
      await db.update(integrationOutbox).set({ status: 'FAILED', nextRetryAt: retryAt, lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(integrationOutbox.id, outboxId));
      throw error;
    }
  },
  { connection, concurrency: 5 },
);

const reminderWorker = new Worker(
  reminderQueueName,
  async (job) => {
    const reminderId = String(job.data.reminderId);
    const [claimed] = await db.update(reminders)
      .set({ status: 'PROCESSING' })
      .where(and(eq(reminders.id, reminderId), eq(reminders.status, 'SCHEDULED')))
      .returning();
    if (!claimed) return;
    const [target] = await db.select({ reminder: reminders, session: verificationSessions, customer: customers })
      .from(reminders)
      .innerJoin(verificationSessions, eq(verificationSessions.id, reminders.sessionId))
      .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
      .where(eq(reminders.id, reminderId))
      .limit(1);
    if (!target) return;
    if (target.session.revokedAt || target.session.expiresAt <= new Date()) {
      await db.update(reminders).set({ status: 'CANCELLED' }).where(eq(reminders.id, reminderId));
      return;
    }
    if (target.customer.whatsappOptOutAt) {
      await db.update(reminders).set({ status: 'CANCELLED' }).where(eq(reminders.id, reminderId));
      await db.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Reminder Worker', action: 'WHATSAPP_SEND_BLOCKED', entityType: 'REMINDER', entityId: reminderId, after: { reason: 'CUSTOMER_OPTED_OUT' }, timestamp: new Date() });
      return;
    }
    if (await isCircuitOpen()) {
      await db.update(reminders).set({ status: 'SCHEDULED', scheduledAt: new Date(Date.now() + Number(process.env.WHATSAPP_CIRCUIT_COOLDOWN_MINUTES ?? 15) * 60 * 1000) }).where(eq(reminders.id, reminderId));
      return;
    }
    const safety = await dispatchSafety(target.customer.phoneE164);
    if (!safety.allowed) {
      await db.update(reminders).set({ status: 'SCHEDULED', scheduledAt: safety.retryAt! }).where(eq(reminders.id, reminderId));
      return;
    }
    try {
      const verificationToken = await createVerificationToken();
      const reminderTtlHours = (await reminderConfig.get()).REMINDER_LINK_TTL_HOURS;
      const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
      const sent = await whatsapp.send({ phoneE164: target.customer.phoneE164, templateName: reminderTemplate.name, templateLanguage: reminderTemplate.language, templateParameters: [target.customer.name, verificationLink], idempotencyKey: `reminder:${reminderId}` });
      const sentAt = new Date();
      const tokenExpiresAt = reminderLinkExpiresAt(sentAt, target.session.expiresAt, reminderTtlHours);
      await db.transaction(async (tx) => {
        await tx.update(reminders).set({ tokenInvalidatedAt: sentAt }).where(and(eq(reminders.sessionId, target.session.id), ne(reminders.id, reminderId), isNotNull(reminders.tokenId), isNull(reminders.tokenInvalidatedAt)));
        await tx.update(verificationSessions).set({ tokenId: verificationToken.tokenId, tokenHash: verificationToken.tokenHash, updatedAt: sentAt }).where(eq(verificationSessions.id, target.session.id));
        await tx.update(reminders).set({ status: 'SENT', sentAt, providerMessageId: sent.providerMessageId, tokenId: verificationToken.tokenId, tokenHash: verificationToken.tokenHash, tokenExpiresAt }).where(eq(reminders.id, reminderId));
      });
      await recordProviderOutcome(true);
      await recordDelivery(target.customer.phoneE164, 'REMINDER', `reminder:${reminderId}`, sent.providerMessageId);
      await db.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Reminder Worker', action: 'REMINDER_SENT', entityType: 'REMINDER', entityId: reminderId, after: { reminderNumber: target.reminder.reminderNumber, providerMessageId: sent.providerMessageId }, timestamp: new Date() });
    } catch (error) {
      await recordProviderOutcome(false);
      const retryCount = target.reminder.retryCount + 1;
      await db.update(reminders).set({ status: retryCount >= 3 ? 'FAILED' : 'SCHEDULED', retryCount, scheduledAt: retryCount >= 3 ? target.reminder.scheduledAt : new Date(Date.now() + retryCount * 60 * 1000) }).where(eq(reminders.id, reminderId));
      if (retryCount >= 3) await db.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Reminder Worker', action: 'REMINDER_FAILED', entityType: 'REMINDER', entityId: reminderId, after: { retryCount }, timestamp: new Date() });
      throw error;
    }
  },
  { connection, concurrency: 5 },
);

const refreshCampaign = async (campaignId: string) => {
  const [counts] = await db.select({
    sent: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('SENT', 'DELIVERED', 'READ'))`,
    failed: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('FAILED', 'PROVIDER_UNAVAILABLE', 'OPTED_OUT'))`,
    pending: sql<number>`count(*) filter (where ${verificationCampaignItems.status} in ('PENDING', 'PROCESSING'))`,
  }).from(verificationCampaignItems).where(eq(verificationCampaignItems.campaignId, campaignId));
  const [campaign] = await db.select({ materializationComplete: verificationCampaigns.materializationComplete, status: verificationCampaigns.status }).from(verificationCampaigns).where(eq(verificationCampaigns.id, campaignId));
  if (!campaign) return;
  await db.update(verificationCampaigns).set({ sentCount: Number(counts.sent), failedCount: Number(counts.failed), status: campaign.status === 'PAUSED' ? 'PAUSED' : campaign.materializationComplete && Number(counts.pending) === 0 ? 'COMPLETED' : 'RUNNING', updatedAt: new Date() }).where(eq(verificationCampaigns.id, campaignId));
};

const campaignWorker = new Worker(
  campaignQueueName,
  async (job) => {
    if (job.name === 'materialize-campaign') {
      const campaignId = String(job.data.campaignId);
      const lockKey = `campaign:materialize:${campaignId}`;
      const lockToken = randomUUID();
      if (!(await connection.set(lockKey, lockToken, 'EX', 120, 'NX'))) return;
      try {
        await campaigns.materializeNext(campaignId);
      } finally {
        if ((await connection.get(lockKey)) === lockToken) await connection.del(lockKey);
      }
      return;
    }
    const itemId = String(job.data.itemId);
    const [claimed] = await db.update(verificationCampaignItems)
      .set({ status: 'PROCESSING', processingStartedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(verificationCampaignItems.id, itemId), eq(verificationCampaignItems.status, 'PENDING')))
      .returning();
    if (!claimed) return;
    const [target] = await db.select({ item: verificationCampaignItems, campaign: verificationCampaigns, session: verificationSessions, customer: customers })
      .from(verificationCampaignItems)
      .innerJoin(verificationCampaigns, eq(verificationCampaigns.id, verificationCampaignItems.campaignId))
      .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
      .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
      .where(eq(verificationCampaignItems.id, itemId))
      .limit(1);
    if (!target) return;
    if (target.campaign.status !== 'RUNNING') {
      await db.update(verificationCampaignItems).set({ status: 'PENDING', updatedAt: new Date() }).where(eq(verificationCampaignItems.id, itemId));
      return;
    }
    if (await isCircuitOpen()) {
      await db.update(verificationCampaignItems).set({ status: 'PENDING', scheduledAt: new Date(Date.now() + Number(process.env.WHATSAPP_CIRCUIT_COOLDOWN_MINUTES ?? 15) * 60 * 1000), updatedAt: new Date() }).where(eq(verificationCampaignItems.id, itemId));
      return;
    }
    if (target.customer.whatsappOptOutAt) {
      await db.update(verificationCampaignItems).set({ status: 'OPTED_OUT', lastError: 'CUSTOMER_OPTED_OUT', failedAt: new Date(), updatedAt: new Date() }).where(eq(verificationCampaignItems.id, itemId));
      await refreshCampaign(target.item.campaignId);
      return;
    }
    const safety = await dispatchSafety(target.customer.phoneE164);
    if (!safety.allowed) {
      await db.update(verificationCampaignItems).set({ status: 'PENDING', scheduledAt: safety.retryAt!, updatedAt: new Date() }).where(eq(verificationCampaignItems.id, itemId));
      return;
    }
    try {
      const verificationToken = await createVerificationToken();
      const expiresAt = new Date(Date.now() + Number(process.env.VERIFICATION_TOKEN_TTL_DAYS ?? 7) * 86400000);
      const verificationLink = `${process.env.WEB_ORIGIN}/v/${verificationToken.rawToken}`;
       const sent = await whatsapp.send({ phoneE164: target.customer.phoneE164, templateName: invitationTemplate.name, templateLanguage: invitationTemplate.language, templateParameters: [target.customer.name, verificationLink], idempotencyKey: `campaign-invitation:${itemId}` });
      await db.transaction(async (tx) => {
        await tx.update(reminders).set({ tokenInvalidatedAt: new Date() }).where(and(eq(reminders.sessionId, target.session.id), isNotNull(reminders.tokenId), isNull(reminders.tokenInvalidatedAt)));
        await tx.update(verificationSessions).set({ tokenId: verificationToken.tokenId, tokenHash: verificationToken.tokenHash, expiresAt, verificationStatus: 'MESSAGE_SENT', updatedAt: new Date() }).where(eq(verificationSessions.id, target.session.id));
      });
      await recordProviderOutcome(true);
      await db.update(verificationCampaignItems).set({ status: 'SENT', sentAt: new Date(), providerMessageId: sent.providerMessageId, lastError: null, updatedAt: new Date() }).where(eq(verificationCampaignItems.id, itemId));
      await recordDelivery(target.customer.phoneE164, 'CAMPAIGN_INVITATION', `campaign-invitation:${itemId}`, sent.providerMessageId);
      await db.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Campaign Worker', action: 'CAMPAIGN_INVITATION_SENT', entityType: 'CAMPAIGN_ITEM', entityId: itemId, after: { campaignId: target.item.campaignId, sessionId: target.item.sessionId, providerMessageId: sent.providerMessageId }, timestamp: new Date() });
    } catch {
      await recordProviderOutcome(false);
      const retryCount = target.item.retryCount + 1;
      const terminal = retryCount >= 3;
      await db.update(verificationCampaignItems).set({ status: terminal ? 'PROVIDER_UNAVAILABLE' : 'PENDING', retryCount, scheduledAt: terminal ? target.item.scheduledAt : new Date(Date.now() + retryCount * 60 * 1000), lastError: 'PROVIDER_UNAVAILABLE', failedAt: terminal ? new Date() : null, updatedAt: new Date() }).where(eq(verificationCampaignItems.id, itemId));
      if (terminal) await db.insert(auditLogs).values({ actorUserId: 'system', actorName: 'Campaign Worker', action: 'CAMPAIGN_INVITATION_FAILED', entityType: 'CAMPAIGN_ITEM', entityId: itemId, after: { campaignId: target.item.campaignId, retryCount, reason: 'PROVIDER_UNAVAILABLE' }, timestamp: new Date() });
      throw new Error('Campaign invitation provider unavailable');
    } finally {
      await refreshCampaign(target.item.campaignId);
    }
  },
  { connection, concurrency: 5, limiter: { max: Number(process.env.WHATSAPP_RATE_LIMIT_PER_SECOND ?? 2), duration: 1000 } },
);

const enqueuePendingOutbox = async () => {
  const pending = await db.select({ id: integrationOutbox.id, eventType: integrationOutbox.eventType, payload: integrationOutbox.payload })
    .from(integrationOutbox)
    .where(or(
      eq(integrationOutbox.status, 'PENDING'),
      and(eq(integrationOutbox.status, 'FAILED'), or(isNull(integrationOutbox.nextRetryAt), lte(integrationOutbox.nextRetryAt, new Date()))),
    ))
    .limit(100);
  await Promise.all(pending.map((event) => outboxQueue.add(event.eventType, { outboxId: event.id, payload: event.payload }, { jobId: event.id, attempts: 1, removeOnComplete: true, removeOnFail: true })));
};

const enqueueDueReminders = async () => {
  const due = await db.select({ id: reminders.id, sessionId: reminders.sessionId })
    .from(reminders)
    .where(and(eq(reminders.status, 'SCHEDULED'), lte(reminders.scheduledAt, new Date())))
    .orderBy(reminders.scheduledAt, reminders.id)
    .limit(Number(process.env.CAMPAIGN_QUEUE_SCAN_LIMIT ?? 100));
  await Promise.all(due.map((reminder) => reminderQueue.add('send-whatsapp-reminder', { reminderId: reminder.id, sessionId: reminder.sessionId }, { jobId: reminder.id, attempts: 1, removeOnComplete: true, removeOnFail: true })));
};

const enqueueDueCampaignItems = async () => {
  const due = await db.select({ id: verificationCampaignItems.id })
    .from(verificationCampaignItems)
    .innerJoin(verificationCampaigns, eq(verificationCampaigns.id, verificationCampaignItems.campaignId))
    .where(and(eq(verificationCampaignItems.status, 'PENDING'), eq(verificationCampaigns.status, 'RUNNING'), lte(verificationCampaignItems.scheduledAt, new Date())))
    .orderBy(verificationCampaignItems.scheduledAt, verificationCampaignItems.id)
    .limit(Number(process.env.CAMPAIGN_QUEUE_SCAN_LIMIT ?? 100));
  await Promise.all(due.map((item) => campaignQueue.add('send-campaign-invitation', { itemId: item.id }, { jobId: item.id, attempts: 1, removeOnComplete: true, removeOnFail: true })));
};

const enqueueCampaignMaterialization = async () => {
  const campaignsToMaterialize = await db.select({ id: verificationCampaigns.id, cursor: verificationCampaigns.materializationCursor })
    .from(verificationCampaigns)
    .where(and(eq(verificationCampaigns.status, 'RUNNING'), eq(verificationCampaigns.materializationComplete, false)))
    .orderBy(verificationCampaigns.updatedAt, verificationCampaigns.id)
    .limit(20);
  await Promise.all(campaignsToMaterialize.map((campaign) => campaignQueue.add('materialize-campaign', { campaignId: campaign.id }, { jobId: `materialize:${campaign.id}:${campaign.cursor ?? 'start'}`, attempts: 1, removeOnComplete: true, removeOnFail: true })));
};

const poll = async () => {
  await Promise.all([enqueuePendingOutbox(), enqueueDueReminders(), enqueueDueCampaignItems(), enqueueCampaignMaterialization()]);
};
const poller = setInterval(() => { void poll().catch(() => console.error('[worker:poller:failed]')); }, 5000);
void poll().catch(() => console.error('[worker:poller:failed]'));

outboxWorker.on('completed', (job) => console.info('[outbox:worker:completed]', job.id));
outboxWorker.on('failed', (job) => console.error('[outbox:worker:failed]', job?.id));
reminderWorker.on('completed', (job) => console.info('[reminder:worker:completed]', job.id));
reminderWorker.on('failed', (job) => console.error('[reminder:worker:failed]', job?.id));
campaignWorker.on('completed', (job) => console.info('[campaign:worker:completed]', job.id));
campaignWorker.on('failed', (job) => console.error('[campaign:worker:failed]', job?.id));

const shutdown = async () => {
  clearInterval(poller);
  await outboxWorker.close();
  await reminderWorker.close();
  await campaignWorker.close();
  await outboxQueue.close();
  await reminderQueue.close();
  await campaignQueue.close();
  await connection.quit();
  await pool.end();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
