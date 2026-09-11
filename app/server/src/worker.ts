import 'dotenv/config';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Queue, Worker } from 'bullmq';
import { and, desc, eq, inArray, isNull, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { db, pool } from './db/client.js';
import {
  auditLogs,
  customers,
  customerAddresses,
  importJobs,
  integrationOutbox,
  reminders,
  verificationCampaignItems,
  verificationCampaigns,
  verificationSessions,
  whatsappDeliveryLogs,
} from './db/schema/index.js';
import { ConsoleWhatsAppAdapter } from './integrations/whatsapp/console-whatsapp.adapter.js';
import { MekariWhatsAppAdapter } from './integrations/whatsapp/mekari-whatsapp.adapter.js';
import { DisabledWhatsAppAdapter } from './integrations/whatsapp/disabled-whatsapp.adapter.js';
import { WhatsAppPort } from './integrations/whatsapp/whatsapp.port.js';
import { hashPhone, nextAllowedSendAt, nextUtcMidnight } from './integrations/whatsapp/whatsapp.policy.js';
import { createVerificationToken } from './modules/verification/verification-token.js';
import { CampaignService } from './modules/campaigns/campaign.service.js';
import { ValidationConfigService } from './config/validation-config.service.js';
import { getWhatsAppTemplate } from './integrations/whatsapp/whatsapp.templates.js';
import { nextAutomaticReminderAt, reminderLinkExpiresAt } from './modules/reminders/reminder.policy.js';
import { CampaignItemState } from './modules/campaigns/campaign-item-state.js';
import { ReadCacheService } from './common/read-cache.service.js';
import { logEvent } from './common/structured-log.js';
import { queueNames } from './common/queue-names.js';
import { getPublicWebOrigin } from './config/public-origin.js';
import { createCoordinateAuditGeocodingAdapter } from './integrations/geocoding/geocoding.adapter.factory.js';
import { auditCoordinateAddress } from './modules/validation/coordinate-audit.js';
import {
  shouldAuditImportedCoordinate,
  shouldAutoVerifyCoordinateAudit,
} from './modules/validation/coordinate-audit.policy.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null }).on(
  'error',
  () => undefined,
);
const execFileAsync = promisify(execFile);
const workerRole = process.env.WORKER_ROLE ?? 'all';
const runs = (role: string) => workerRole === 'all' || workerRole === role;
const importStorageDirectory = resolve(process.env.IMPORT_STORAGE_DIR ?? resolve(process.cwd(), 'var', 'imports'));
const resolveImportFilePath = (storedPath: string) =>
  resolve(importStorageDirectory, basename(storedPath.replaceAll('\\', '/')));
const {
  outbox: outboxQueueName,
  reminders: reminderQueueName,
  campaignMaterialization: campaignMaterializationQueueName,
  campaignSend: campaignSendQueueName,
  metrics: metricsQueueName,
  imports: importQueueName,
  coordinateAudit: coordinateAuditQueueName,
} = queueNames;
const queueSafeJobId = (...parts: Array<string | number>) =>
  parts.map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, '-')).join('-');
const outboxQueue = new Queue(outboxQueueName, { connection });
const reminderQueue = new Queue(reminderQueueName, { connection });
const campaignMaterializationQueue = new Queue(campaignMaterializationQueueName, { connection });
const campaignSendQueue = new Queue(campaignSendQueueName, { connection });
const metricsQueue = new Queue(metricsQueueName, { connection });
const importQueue = new Queue(importQueueName, { connection });
const coordinateAuditQueue = new Queue(coordinateAuditQueueName, { connection });
let pendingCoordinateAuditsEnqueued = false;
const whatsappProvider = process.env.WHATSAPP_PROVIDER ?? 'disabled';
const invitationTemplate = getWhatsAppTemplate('INVITATION');
const reminderTemplate = getWhatsAppTemplate('REMINDER');
const whatsapp: WhatsAppPort =
  whatsappProvider === 'mekari'
    ? new MekariWhatsAppAdapter()
    : process.env.NODE_ENV === 'production'
      ? new DisabledWhatsAppAdapter()
      : new ConsoleWhatsAppAdapter();
const campaigns = new CampaignService(new ValidationConfigService(), new ReadCacheService());
const reminderConfig = new ValidationConfigService();
const messagingConfig = new ValidationConfigService();

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const whatsappRateLimitKey = `whatsapp:send:rate-limit:${whatsappProvider}`;
const acquireWhatsAppSendSlot = async () => {
  const requestsPerSecond = (await messagingConfig.get()).WHATSAPP_RATE_LIMIT_PER_SECOND;
  const intervalMilliseconds = Math.max(1, Math.floor(1000 / requestsPerSecond));

  while (true) {
    const reserved = await connection.set(whatsappRateLimitKey, randomUUID(), 'PX', intervalMilliseconds, 'NX');
    if (reserved === 'OK') return;

    const timeToNextSlot = await connection.pttl(whatsappRateLimitKey);
    await wait(timeToNextSlot > 0 ? timeToNextSlot : intervalMilliseconds);
  }
};

const circuitBucket = () => `whatsapp:outcomes:${Math.floor(Date.now() / 60000)}`;
const isCircuitOpen = async () => (await connection.get('whatsapp:circuit:open')) === '1';
const recordProviderOutcome = async (success: boolean) => {
  const key = circuitBucket();
  await connection.hincrby(key, 'attempts', 1);
  if (!success) await connection.hincrby(key, 'failures', 1);
  await connection.expire(key, 180);
  const attempts = Number((await connection.hget(key, 'attempts')) ?? 0);
  const failures = Number((await connection.hget(key, 'failures')) ?? 0);
  const minimum = Number(process.env.WHATSAPP_CIRCUIT_MIN_ATTEMPTS ?? 50);
  const ratio = Number(process.env.WHATSAPP_CIRCUIT_FAILURE_RATIO ?? 0.3);
  if (attempts >= minimum && failures / attempts >= ratio)
    await connection.set(
      'whatsapp:circuit:open',
      '1',
      'EX',
      Number(process.env.WHATSAPP_CIRCUIT_COOLDOWN_MINUTES ?? 15) * 60,
    );
};

const dispatchSafety = async (phoneE164: string, campaignId?: string, campaignDailySendLimit?: number) => {
  const runtimeConfig = await messagingConfig.get();
  const current = new Date();
  const [last] = await db
    .select({ sentAt: whatsappDeliveryLogs.sentAt })
    .from(whatsappDeliveryLogs)
    .where(eq(whatsappDeliveryLogs.phoneHash, hashPhone(phoneE164)))
    .orderBy(desc(whatsappDeliveryLogs.sentAt))
    .limit(1);
  const retryAt = nextAllowedSendAt(
    last?.sentAt ?? null,
    runtimeConfig.WHATSAPP_MIN_INTERVAL_MINUTES,
    current,
  );
  if (retryAt) return { allowed: false, retryAt };
  const cooldownKey = `whatsapp:cooldown:${hashPhone(phoneE164)}`;
  const cooldownSeconds = runtimeConfig.WHATSAPP_MIN_INTERVAL_MINUTES * 60;
  const cooldownReserved = await connection.set(cooldownKey, '1', 'EX', cooldownSeconds, 'NX');
  if (!cooldownReserved) return { allowed: false, retryAt: new Date(current.getTime() + cooldownSeconds * 1000) };
  const dailyDate = current.toISOString().slice(0, 10);
  const globalDailyLimit = runtimeConfig.WHATSAPP_DAILY_SEND_LIMIT;
  const dailyReservations = [
    { key: `whatsapp:daily:${dailyDate}`, limit: globalDailyLimit },
    ...(campaignId
      ? [
          {
            key: `whatsapp:daily:campaign:${campaignId}:${dailyDate}`,
            limit: Math.min(Math.max(campaignDailySendLimit ?? globalDailyLimit, 1), globalDailyLimit),
          },
        ]
      : []),
  ];
  const reservedDailyKeys: string[] = [];
  for (const reservation of dailyReservations) {
    const reservationCount = await connection.incr(reservation.key);
    if (reservationCount === 1) await connection.expire(reservation.key, 172800);
    reservedDailyKeys.push(reservation.key);
    if (reservationCount > reservation.limit) {
      for (const key of reservedDailyKeys) await connection.decr(key);
      await connection.del(cooldownKey);
      return { allowed: false, retryAt: nextUtcMidnight(current) };
    }
  }
  return { allowed: true, retryAt: null };
};

const recordDelivery = async (
  phoneE164: string,
  messageType: string,
  idempotencyKey: string,
  providerMessageId: string,
) => {
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
};

const outboxWorker = runs('messaging')
  ? new Worker(
      outboxQueueName,
      async (job) => {
        const outboxId = String(job.data.outboxId);
        const [event] = await db.select().from(integrationOutbox).where(eq(integrationOutbox.id, outboxId)).limit(1);
        if (!event || event.status === 'PUBLISHED') return;
        const processingAt = new Date();
        await db
          .update(integrationOutbox)
          .set({ status: 'PROCESSING', attemptCount: event.attemptCount + 1, updatedAt: processingAt })
          .where(eq(integrationOutbox.id, outboxId));
        try {
          // Provider-specific consumers remain disabled until credentials are
          // configured. Publishing the durable event is still observable and safe.
          logEvent('info', 'outbox.published', { eventId: event.eventId, eventType: event.eventType });
          await db
            .update(integrationOutbox)
            .set({ status: 'PUBLISHED', sentAt: new Date(), lastError: null, updatedAt: new Date() })
            .where(eq(integrationOutbox.id, outboxId));
        } catch (error) {
          const retryAt = new Date(Date.now() + Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(event.attemptCount, 8)));
          await db
            .update(integrationOutbox)
            .set({
              status: 'FAILED',
              nextRetryAt: retryAt,
              lastError: error instanceof Error ? error.message : String(error),
              updatedAt: new Date(),
            })
            .where(eq(integrationOutbox.id, outboxId));
          throw error;
        }
      },
      { connection, concurrency: 5 },
    )
  : null;

const reminderWorker = runs('messaging')
  ? new Worker(
      reminderQueueName,
      async (job) => {
        const reminderId = String(job.data.reminderId);
        const [claimed] = await db
          .update(reminders)
          .set({ status: 'PROCESSING' })
          .where(and(eq(reminders.id, reminderId), eq(reminders.status, 'SCHEDULED')))
          .returning();
        if (!claimed) return;
        const [target] = await db
          .select({ reminder: reminders, session: verificationSessions, customer: customers })
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
          await db.insert(auditLogs).values({
            actorUserId: 'system',
            actorName: 'Reminder Worker',
            action: 'WHATSAPP_SEND_BLOCKED',
            entityType: 'REMINDER',
            entityId: reminderId,
            after: { reason: 'CUSTOMER_OPTED_OUT' },
            timestamp: new Date(),
          });
          return;
        }
        if (await isCircuitOpen()) {
          await db
            .update(reminders)
            .set({
              status: 'SCHEDULED',
              scheduledAt: new Date(
                Date.now() + Number(process.env.WHATSAPP_CIRCUIT_COOLDOWN_MINUTES ?? 15) * 60 * 1000,
              ),
            })
            .where(eq(reminders.id, reminderId));
          return;
        }
        const safety = await dispatchSafety(target.customer.phoneE164);
        if (!safety.allowed) {
          await db
            .update(reminders)
            .set({ status: 'SCHEDULED', scheduledAt: safety.retryAt! })
            .where(eq(reminders.id, reminderId));
          return;
        }
        try {
          const verificationToken = await createVerificationToken();
          const runtimeConfig = await reminderConfig.get();
          const reminderTtlHours = runtimeConfig.REMINDER_LINK_TTL_HOURS;
          const verificationLink = `${getPublicWebOrigin()}/v/${verificationToken.rawToken}`;
          await acquireWhatsAppSendSlot();
          const sent = await whatsapp.send({
            phoneE164: target.customer.phoneE164,
            recipientName: target.customer.name,
            templateName: reminderTemplate.name,
            messageTemplateId: reminderTemplate.messageTemplateId,
            templateLanguage: reminderTemplate.language,
            templateParameters: [target.customer.name, verificationLink],
            templateParameterNames: reminderTemplate.parameterNames,
            idempotencyKey: `reminder:${reminderId}`,
          });
          const sentAt = new Date();
          const tokenExpiresAt = reminderLinkExpiresAt(sentAt, target.session.expiresAt, reminderTtlHours);
          const nextReminderNumber = target.reminder.reminderNumber + 1;
          const nextScheduledAt =
            nextReminderNumber <= runtimeConfig.MAX_REMINDERS_PER_SESSION
              ? nextAutomaticReminderAt(target.reminder.scheduledAt, target.session.expiresAt)
              : null;
          await db.transaction(async (tx) => {
            await tx
              .update(reminders)
              .set({ tokenInvalidatedAt: sentAt })
              .where(
                and(
                  eq(reminders.sessionId, target.session.id),
                  ne(reminders.id, reminderId),
                  isNotNull(reminders.tokenId),
                  isNull(reminders.tokenInvalidatedAt),
                ),
              );
            await tx
              .update(verificationSessions)
              .set({
                tokenId: verificationToken.tokenId,
                tokenHash: verificationToken.tokenHash,
                reminderCount: nextScheduledAt ? nextReminderNumber : target.session.reminderCount,
                verificationStatus:
                  nextScheduledAt && nextReminderNumber >= runtimeConfig.MAX_REMINDERS_PER_SESSION
                    ? 'REMINDER_LIMIT_REACHED'
                    : target.session.verificationStatus,
                updatedAt: sentAt,
              })
              .where(eq(verificationSessions.id, target.session.id));
            await tx
              .update(reminders)
              .set({
                status: 'SENT',
                sentAt,
                providerMessageId: sent.providerMessageId,
                tokenId: verificationToken.tokenId,
                tokenHash: verificationToken.tokenHash,
                tokenExpiresAt,
              })
              .where(eq(reminders.id, reminderId));
            if (nextScheduledAt) {
              await tx.insert(reminders).values({
                id: randomUUID(),
                sessionId: target.session.id,
                reminderNumber: nextReminderNumber,
                channel: 'WHATSAPP',
                scheduledAt: nextScheduledAt,
                status: 'SCHEDULED',
                messageText: `Halo ${target.customer.name}, pengingat ${nextReminderNumber} dari ${runtimeConfig.MAX_REMINDERS_PER_SESSION}. Tautan baru berlaku maksimal ${runtimeConfig.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`,
                retryCount: 0,
                createdAt: sentAt,
              });
              await tx.insert(auditLogs).values({
                actorUserId: 'system',
                actorName: 'Reminder Scheduler',
                action: 'REMINDER_SCHEDULED',
                entityType: 'REMINDER',
                entityId: target.session.id,
                after: {
                  reminderNumber: nextReminderNumber,
                  scheduledAt: nextScheduledAt.toISOString(),
                  automaticSchedule: true,
                  trigger: 'PREVIOUS_LINK_NOT_OPENED',
                },
                timestamp: sentAt,
              });
            }
          });
          await recordProviderOutcome(true);
          await recordDelivery(target.customer.phoneE164, 'REMINDER', `reminder:${reminderId}`, sent.providerMessageId);
          await db.insert(auditLogs).values({
            actorUserId: 'system',
            actorName: 'Reminder Worker',
            action: 'REMINDER_SENT',
            entityType: 'REMINDER',
            entityId: reminderId,
            after: { reminderNumber: target.reminder.reminderNumber, providerMessageId: sent.providerMessageId },
            timestamp: new Date(),
          });
        } catch (error) {
          await recordProviderOutcome(false);
          const retryCount = target.reminder.retryCount + 1;
          await db
            .update(reminders)
            .set({
              status: retryCount >= 3 ? 'FAILED' : 'SCHEDULED',
              retryCount,
              scheduledAt:
                retryCount >= 3 ? target.reminder.scheduledAt : new Date(Date.now() + retryCount * 60 * 1000),
            })
            .where(eq(reminders.id, reminderId));
          if (retryCount >= 3)
            await db.insert(auditLogs).values({
              actorUserId: 'system',
              actorName: 'Reminder Worker',
              action: 'REMINDER_FAILED',
              entityType: 'REMINDER',
              entityId: reminderId,
              after: { retryCount },
              timestamp: new Date(),
            });
          throw error;
        }
      },
      { connection, concurrency: 5 },
    )
  : null;

const campaignMaterializationWorker = runs('campaign')
  ? new Worker(
      campaignMaterializationQueueName,
      async (job) => {
        const campaignId = String(job.data.campaignId);
        const lockKey = `campaign:materialize:${campaignId}`;
        const lockToken = randomUUID();
        if (!(await connection.set(lockKey, lockToken, 'EX', 120, 'NX'))) return;
        try {
          await campaigns.materializeNext(campaignId);
        } finally {
          if ((await connection.get(lockKey)) === lockToken) await connection.del(lockKey);
        }
      },
      { connection, concurrency: 2 },
    )
  : null;

const campaignWorker = runs('campaign')
  ? new Worker(
      campaignSendQueueName,
      async (job) => {
        const itemId = String(job.data.itemId);
        const claimed = await CampaignItemState.claim(itemId);
        if (!claimed) return;
        const [target] = await db
          .select({
            item: verificationCampaignItems,
            campaign: verificationCampaigns,
            session: verificationSessions,
            customer: customers,
          })
          .from(verificationCampaignItems)
          .innerJoin(verificationCampaigns, eq(verificationCampaigns.id, verificationCampaignItems.campaignId))
          .innerJoin(verificationSessions, eq(verificationSessions.id, verificationCampaignItems.sessionId))
          .innerJoin(customers, eq(customers.id, verificationCampaignItems.customerId))
          .where(eq(verificationCampaignItems.id, itemId))
          .limit(1);
        if (!target) return;
        if (target.campaign.status !== 'RUNNING') {
          await db
            .update(verificationCampaignItems)
            .set({ status: 'PENDING', processingStartedAt: null, updatedAt: new Date() })
            .where(eq(verificationCampaignItems.id, itemId));
          return;
        }
        if (await isCircuitOpen()) {
          await db
            .update(verificationCampaignItems)
            .set({
              status: 'PENDING',
              processingStartedAt: null,
              scheduledAt: new Date(
                Date.now() + Number(process.env.WHATSAPP_CIRCUIT_COOLDOWN_MINUTES ?? 15) * 60 * 1000,
              ),
              updatedAt: new Date(),
            })
            .where(eq(verificationCampaignItems.id, itemId));
          return;
        }
        if (target.customer.whatsappOptOutAt) {
          await CampaignItemState.markOptedOut(itemId, new Date());
          return;
        }
        const safety = await dispatchSafety(
          target.customer.phoneE164,
          target.item.campaignId,
          target.campaign.dailySendLimit,
        );
        if (!safety.allowed) {
          await db
            .update(verificationCampaignItems)
            .set({ status: 'PENDING', processingStartedAt: null, scheduledAt: safety.retryAt!, updatedAt: new Date() })
            .where(eq(verificationCampaignItems.id, itemId));
          return;
        }
        let providerAccepted = false;
        try {
          const verificationToken = await createVerificationToken();
          const expiresAt = new Date(Date.now() + Number(process.env.VERIFICATION_TOKEN_TTL_DAYS ?? 7) * 86400000);
          const verificationLink = `${getPublicWebOrigin()}/v/${verificationToken.rawToken}`;
          await acquireWhatsAppSendSlot();
          const sent = await whatsapp.send({
            phoneE164: target.customer.phoneE164,
            recipientName: target.customer.name,
            templateName: invitationTemplate.name,
            messageTemplateId: invitationTemplate.messageTemplateId,
            templateLanguage: invitationTemplate.language,
            templateParameters: [target.customer.name, verificationLink],
            templateParameterNames: invitationTemplate.parameterNames,
            idempotencyKey: `campaign-invitation:${itemId}`,
          });
          providerAccepted = true;
          await db.transaction(async (tx) => {
            await tx
              .update(reminders)
              .set({ tokenInvalidatedAt: new Date() })
              .where(
                and(
                  eq(reminders.sessionId, target.session.id),
                  isNotNull(reminders.tokenId),
                  isNull(reminders.tokenInvalidatedAt),
                ),
              );
            await tx
              .update(verificationSessions)
              .set({
                tokenId: verificationToken.tokenId,
                tokenHash: verificationToken.tokenHash,
                expiresAt,
                verificationStatus: 'MESSAGE_SENT',
                updatedAt: new Date(),
              })
              .where(eq(verificationSessions.id, target.session.id));
          });
          await recordProviderOutcome(true);
          await CampaignItemState.markSent(itemId, sent.providerMessageId, new Date());
          await recordDelivery(
            target.customer.phoneE164,
            'CAMPAIGN_INVITATION',
            `campaign-invitation:${itemId}`,
            sent.providerMessageId,
          );
          await db.insert(auditLogs).values({
            actorUserId: 'system',
            actorName: 'Campaign Worker',
            action: 'CAMPAIGN_INVITATION_SENT',
            entityType: 'CAMPAIGN_ITEM',
            entityId: itemId,
            after: {
              campaignId: target.item.campaignId,
              sessionId: target.item.sessionId,
              providerMessageId: sent.providerMessageId,
            },
            timestamp: new Date(),
          });
        } catch (error) {
          await recordProviderOutcome(false);
          const retryCount = target.item.retryCount + 1;
          const terminal = retryCount >= 3;
          const errorMessage = (error instanceof Error ? error.message : String(error))
            .replace(/\s+/g, ' ')
            .slice(0, 1000);
          if (!providerAccepted) await connection.del(`whatsapp:cooldown:${hashPhone(target.customer.phoneE164)}`);
          await CampaignItemState.markFailure(
            itemId,
            retryCount,
            terminal,
            errorMessage || 'PROVIDER_UNAVAILABLE',
            new Date(),
          );
          if (terminal)
            await db.insert(auditLogs).values({
              actorUserId: 'system',
              actorName: 'Campaign Worker',
              action: 'CAMPAIGN_INVITATION_FAILED',
              entityType: 'CAMPAIGN_ITEM',
              entityId: itemId,
              after: {
                campaignId: target.item.campaignId,
                retryCount,
                reason: errorMessage || 'PROVIDER_UNAVAILABLE',
              },
              timestamp: new Date(),
            });
          throw error;
        }
      },
      {
        connection,
        concurrency: 5,
      },
    )
  : null;

const importWorker = runs('import')
  ? new Worker(
      importQueueName,
      async (job) => {
        const importJobId = String(job.data.importJobId);
        const [importJob] = await db.select().from(importJobs).where(eq(importJobs.id, importJobId)).limit(1);
        if (!importJob || importJob.status === 'COMPLETED') return;

        const startedAt = new Date();
        await db
          .update(importJobs)
          .set({ status: 'PROCESSING', startedAt, updatedAt: startedAt })
          .where(eq(importJobs.id, importJobId));
        try {
          const importFilePath = resolveImportFilePath(importJob.filePath);
          const { stdout } = await execFileAsync(
            process.execPath,
            [resolve(process.cwd(), 'scripts/import-prereg-xlsx.mjs'), importFilePath],
            {
              cwd: process.cwd(),
              env: process.env,
              maxBuffer: 4 * 1024 * 1024,
            },
          );
          const result = JSON.parse(stdout.trim()) as {
            rowsRead: number;
            customersUpserted: number;
            addressesInserted: number;
            addressesUpdated: number;
          };
          const completedAt = new Date();
          await db
            .update(importJobs)
            .set({
              status: 'COMPLETED',
              rowsRead: result.rowsRead,
              rowsProcessed: result.rowsRead,
              rowsFailed: 0,
              customersUpserted: result.customersUpserted,
              addressesInserted: result.addressesInserted,
              addressesUpdated: result.addressesUpdated,
              errorSummary: null,
              completedAt,
              updatedAt: completedAt,
            })
            .where(eq(importJobs.id, importJobId));
          const pendingCoordinateAudits = await db
            .select({ id: customerAddresses.id })
            .from(customerAddresses)
            .innerJoin(customers, eq(customers.id, customerAddresses.customerId))
            .where(
              and(
                eq(customerAddresses.referenceSource, 'PREREG_IMPORT'),
                eq(customerAddresses.coordinateAuditStatus, 'PENDING'),
                isNotNull(customerAddresses.referenceLocation),
                ne(customers.status, 'VERIFIED'),
              ),
            )
            .limit(10000);
          if (pendingCoordinateAudits.length)
            await coordinateAuditQueue.addBulk(
              pendingCoordinateAudits.map(({ id }) => ({
                name: 'audit-imported-coordinate',
                data: { addressId: id },
                opts: { jobId: queueSafeJobId('coordinate-audit', id), removeOnComplete: true, removeOnFail: false },
              })),
            );
          await db.insert(auditLogs).values({
            actorUserId: 'system',
            actorName: 'Import Worker',
            action: 'CUSTOMER_IMPORT_COMPLETED',
            entityType: 'IMPORT_JOB',
            entityId: importJobId,
            after: {
              rowsRead: result.rowsRead,
              customersUpserted: result.customersUpserted,
              addressesInserted: result.addressesInserted,
              addressesUpdated: result.addressesUpdated,
              coordinateAuditsQueued: pendingCoordinateAudits.length,
            },
            timestamp: completedAt,
          });
          await rm(importFilePath, { force: true });
        } catch (error) {
          const message = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 1000);
          const retrying = job.attemptsMade + 1 < Number(job.opts.attempts ?? 1);
          const updatedAt = new Date();
          await db
            .update(importJobs)
            .set({
              status: retrying ? 'QUEUED' : 'FAILED',
              errorSummary: message,
              completedAt: retrying ? null : updatedAt,
              updatedAt,
            })
            .where(eq(importJobs.id, importJobId));
          if (!retrying) await rm(resolveImportFilePath(importJob.filePath), { force: true });
          throw error;
        }
      },
      { connection, concurrency: Number(process.env.IMPORT_WORKER_CONCURRENCY ?? 1) },
    )
  : null;

const coordinateGeocoder = runs('import') ? createCoordinateAuditGeocodingAdapter() : null;
const coordinateAuditWorker = runs('import')
  ? new Worker(
      coordinateAuditQueueName,
      async (job) => {
        const addressId = String(job.data.addressId);
        const [row] = await db
          .select({
            address: customerAddresses,
            customerStatus: customers.status,
            referenceLatitude: sql<number>`ST_Y(${customerAddresses.referenceLocation}::geometry)`,
            referenceLongitude: sql<number>`ST_X(${customerAddresses.referenceLocation}::geometry)`,
          })
          .from(customerAddresses)
          .innerJoin(customers, eq(customers.id, customerAddresses.customerId))
          .where(eq(customerAddresses.id, addressId))
          .limit(1);
        if (
          !row ||
          !shouldAuditImportedCoordinate({
            customerStatus: row.customerStatus,
            referenceSource: row.address.referenceSource,
            coordinateAuditStatus: row.address.coordinateAuditStatus,
            hasReferenceLocation: row.address.referenceLocation != null,
          })
        )
          return;

        const latitude = row.referenceLatitude == null ? null : Number(row.referenceLatitude);
        const longitude = row.referenceLongitude == null ? null : Number(row.referenceLongitude);
        const auditedAt = new Date();
        if (
          latitude == null ||
          longitude == null ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          await db
            .update(customerAddresses)
            .set({
              coordinateAuditStatus: 'INVALID',
              coordinateAuditReason: 'Latitude atau longitude tidak valid.',
              coordinateAuditConfidence: '1.000',
              coordinateAuditedAt: auditedAt,
              updatedAt: auditedAt,
            })
            .where(eq(customerAddresses.id, addressId));
          return;
        }

        try {
          const reverseGeocode = await coordinateGeocoder!.reverse(latitude, longitude);
          const audit = auditCoordinateAddress(
            {
              province: row.address.province,
              city: row.address.city,
              district: row.address.district,
              subdistrict: row.address.subdistrict,
              street: row.address.street,
            },
            reverseGeocode,
          );
          const auditFields = {
            coordinateAuditStatus: audit.status,
            coordinateAuditReason: audit.reason,
            coordinateAuditEvidence: audit.evidence,
            coordinateAuditConfidence: audit.confidence.toFixed(3),
            coordinateAuditedAt: auditedAt,
            updatedAt: auditedAt,
          };
          if (!shouldAutoVerifyCoordinateAudit(audit.status)) {
            await db.update(customerAddresses).set(auditFields).where(eq(customerAddresses.id, addressId));
            return;
          }

          await db.transaction(async (tx) => {
            await tx
              .update(customerAddresses)
              .set({
                addressStatus: 'SUPERSEDED',
                addressType: 'HISTORICAL',
                isActive: false,
                validTo: auditedAt,
                updatedAt: auditedAt,
              })
              .where(
                and(
                  eq(customerAddresses.customerId, row.address.customerId),
                  eq(customerAddresses.isActive, true),
                  ne(customerAddresses.id, addressId),
                ),
              );
            await tx
              .update(customerAddresses)
              .set({
                ...auditFields,
                isVerified: true,
                addressStatus: 'VERIFIED',
                addressType: 'VERIFIED_INSTALLATION',
                isActive: true,
              })
              .where(eq(customerAddresses.id, addressId));
            await tx
              .update(customers)
              .set({ status: 'VERIFIED', updatedAt: auditedAt })
              .where(eq(customers.id, row.address.customerId));

            const activeSessions = await tx
              .select({ id: verificationSessions.id })
              .from(verificationSessions)
              .where(and(eq(verificationSessions.customerId, row.address.customerId), isNull(verificationSessions.completedAt)));
            if (activeSessions.length) {
              const sessionIds = activeSessions.map(({ id }) => id);
              await tx
                .update(verificationSessions)
                .set({
                  verificationStatus: 'LOCATION_VALID',
                  locationVerifiedAt: auditedAt,
                  completedAt: auditedAt,
                  revokedAt: auditedAt,
                  updatedAt: auditedAt,
                })
                .where(inArray(verificationSessions.id, sessionIds));
              await tx
                .update(reminders)
                .set({ status: 'CANCELLED' })
                .where(and(inArray(reminders.sessionId, sessionIds), eq(reminders.status, 'SCHEDULED')));
            }
            await tx.insert(auditLogs).values({
              actorUserId: 'system',
              actorName: 'Coordinate Audit Worker',
              action: 'COORDINATE_AUDIT_AUTO_VERIFIED',
              entityType: 'CUSTOMER_ADDRESS',
              entityId: addressId,
              after: {
                coordinateAuditStatus: audit.status,
                confidence: audit.confidence,
                customerStatus: 'VERIFIED',
                addressStatus: 'VERIFIED',
                activeSessionsClosed: activeSessions.length,
              },
              timestamp: auditedAt,
            });
          });
        } catch (error) {
          await db
            .update(customerAddresses)
            .set({
              coordinateAuditStatus: 'UNCERTAIN',
              coordinateAuditReason: 'Layanan peta tidak tersedia saat audit koordinat.',
              coordinateAuditEvidence: {
                error: error instanceof Error ? error.message.slice(0, 255) : String(error).slice(0, 255),
              },
              coordinateAuditConfidence: '0.000',
              coordinateAuditedAt: auditedAt,
              updatedAt: auditedAt,
            })
            .where(eq(customerAddresses.id, addressId));
        }
      },
      { connection, concurrency: Number(process.env.COORDINATE_AUDIT_CONCURRENCY ?? 1) },
    )
  : null;

const enqueuePendingCoordinateAudits = async () => {
  if (pendingCoordinateAuditsEnqueued || !runs('import')) return;
  const pending = await db
    .select({ id: customerAddresses.id })
    .from(customerAddresses)
    .innerJoin(customers, eq(customers.id, customerAddresses.customerId))
    .where(
      and(
        eq(customerAddresses.referenceSource, 'PREREG_IMPORT'),
        eq(customerAddresses.coordinateAuditStatus, 'PENDING'),
        isNotNull(customerAddresses.referenceLocation),
        ne(customers.status, 'VERIFIED'),
      ),
    )
    .limit(10000);
  if (pending.length)
    await coordinateAuditQueue.addBulk(
      pending.map(({ id }) => ({
        name: 'audit-imported-coordinate',
        data: { addressId: id },
        opts: { jobId: queueSafeJobId('coordinate-audit', id), removeOnComplete: true, removeOnFail: false },
      })),
    );
  pendingCoordinateAuditsEnqueued = true;
};

const recoveryWorker = runs('maintenance')
  ? new Worker(
      metricsQueueName,
      async (job) => {
        if (job.name === 'recover-stuck-campaign-items') {
          const cutoff = new Date(
            Date.now() - Number(process.env.CAMPAIGN_PROCESSING_TIMEOUT_MINUTES ?? 10) * 60 * 1000,
          );
          const stuck = await db
            .select({ id: verificationCampaignItems.id })
            .from(verificationCampaignItems)
            .where(
              and(
                eq(verificationCampaignItems.status, 'PROCESSING'),
                lte(verificationCampaignItems.processingStartedAt, cutoff),
              ),
            )
            .limit(1000);
          if (stuck.length)
            await db
              .update(verificationCampaignItems)
              .set({ status: 'PENDING', processingStartedAt: null, updatedAt: new Date() })
              .where(
                and(
                  eq(verificationCampaignItems.status, 'PROCESSING'),
                  inArray(
                    verificationCampaignItems.id,
                    stuck.map((item) => item.id),
                  ),
                ),
              );
        }
        if (job.name === 'reconcile-campaign') await CampaignItemState.reconcile(String(job.data.campaignId));
      },
      { connection, concurrency: 1 },
    )
  : null;

const enqueuePendingOutbox = async () => {
  const pending = await db
    .select({ id: integrationOutbox.id, eventType: integrationOutbox.eventType, payload: integrationOutbox.payload })
    .from(integrationOutbox)
    .where(
      or(
        eq(integrationOutbox.status, 'PENDING'),
        and(
          eq(integrationOutbox.status, 'FAILED'),
          or(isNull(integrationOutbox.nextRetryAt), lte(integrationOutbox.nextRetryAt, new Date())),
        ),
      ),
    )
    .limit(100);
  await Promise.all(
    pending.map((event) =>
      outboxQueue.add(
        event.eventType,
        { outboxId: event.id, payload: event.payload },
        { jobId: event.id, attempts: 1, removeOnComplete: true, removeOnFail: true },
      ),
    ),
  );
};

const enqueueDueReminders = async () => {
  const due = await db
    .select({ id: reminders.id, sessionId: reminders.sessionId })
    .from(reminders)
    .where(and(eq(reminders.status, 'SCHEDULED'), lte(reminders.scheduledAt, new Date())))
    .orderBy(reminders.scheduledAt, reminders.id)
    .limit(Number(process.env.CAMPAIGN_QUEUE_SCAN_LIMIT ?? 100));
  await Promise.all(
    due.map((reminder) =>
      reminderQueue.add(
        'send-whatsapp-reminder',
        { reminderId: reminder.id, sessionId: reminder.sessionId },
        { jobId: reminder.id, attempts: 1, removeOnComplete: true, removeOnFail: true },
      ),
    ),
  );
};

const enqueueDueCampaignItems = async () => {
  const due = await db
    .select({ id: verificationCampaignItems.id })
    .from(verificationCampaignItems)
    .innerJoin(verificationCampaigns, eq(verificationCampaigns.id, verificationCampaignItems.campaignId))
    .where(
      and(
        eq(verificationCampaignItems.status, 'PENDING'),
        eq(verificationCampaigns.status, 'RUNNING'),
        lte(verificationCampaignItems.scheduledAt, new Date()),
      ),
    )
    .orderBy(verificationCampaignItems.scheduledAt, verificationCampaignItems.id)
    .limit(Number(process.env.CAMPAIGN_QUEUE_SCAN_LIMIT ?? 100));
  await Promise.all(
    due.map((item) =>
      campaignSendQueue.add(
        'send-campaign-invitation',
        { itemId: item.id },
        { jobId: item.id, attempts: 1, removeOnComplete: true, removeOnFail: true },
      ),
    ),
  );
};

const enqueueCampaignMaterialization = async () => {
  const campaignsToMaterialize = await db
    .select({ id: verificationCampaigns.id, cursor: verificationCampaigns.materializationCursor })
    .from(verificationCampaigns)
    .where(and(eq(verificationCampaigns.status, 'RUNNING'), eq(verificationCampaigns.materializationComplete, false)))
    .orderBy(verificationCampaigns.updatedAt, verificationCampaigns.id)
    .limit(20);
  await Promise.all(
    campaignsToMaterialize.map((campaign) =>
      campaignMaterializationQueue.add(
        'materialize-campaign',
        { campaignId: campaign.id },
        {
          jobId: queueSafeJobId('materialize', campaign.id, campaign.cursor ?? 'start'),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
    ),
  );
};

let lastMaintenanceBucket = 0;
let lastReconciliationBucket = 0;
const enqueueMaintenance = async () => {
  const maintenanceBucket = Math.floor(Date.now() / 60000);
  if (maintenanceBucket === lastMaintenanceBucket) return;
  lastMaintenanceBucket = maintenanceBucket;
  await metricsQueue.add(
    'recover-stuck-campaign-items',
    {},
    { jobId: queueSafeJobId('recover', Math.floor(Date.now() / 60000)), removeOnComplete: true, removeOnFail: true },
  );
  const reconciliationBucket = Math.floor(
    Date.now() / (Number(process.env.COUNTER_RECONCILIATION_INTERVAL_SECONDS ?? 300) * 1000),
  );
  if (reconciliationBucket !== lastReconciliationBucket) {
    lastReconciliationBucket = reconciliationBucket;
    const campaignsToReconcile = await db
      .select({ id: verificationCampaigns.id })
      .from(verificationCampaigns)
      .where(eq(verificationCampaigns.status, 'RUNNING'))
      .limit(20);
    await Promise.all(
      campaignsToReconcile.map((campaign) =>
        metricsQueue.add(
          'reconcile-campaign',
          { campaignId: campaign.id },
          {
            jobId: queueSafeJobId('reconcile', campaign.id, reconciliationBucket),
            removeOnComplete: true,
            removeOnFail: true,
          },
        ),
      ),
    );
  }
  const analyzeLock = await connection.set('maintenance:analyze', randomUUID(), 'EX', 3500, 'NX');
  if (analyzeLock)
    await db.execute(
      sql`ANALYZE customers, customer_addresses, verification_sessions, verification_campaign_items, reminders, audit_logs, integration_outbox`,
    );
};

const poll = async () => {
  const jobs: Promise<unknown>[] = [];
  if (runs('messaging')) jobs.push(enqueuePendingOutbox(), enqueueDueReminders());
  if (runs('campaign')) jobs.push(enqueueDueCampaignItems(), enqueueCampaignMaterialization());
  if (runs('import')) jobs.push(enqueuePendingCoordinateAudits());
  if (runs('maintenance')) jobs.push(enqueueMaintenance());
  await Promise.all(jobs);
};
const poller = setInterval(() => {
  void poll().catch((error) =>
    logEvent('error', 'worker.poller_failed', { error: error instanceof Error ? error.message : String(error) }),
  );
}, 5000);
void poll().catch((error) =>
  logEvent('error', 'worker.poller_failed', { error: error instanceof Error ? error.message : String(error) }),
);

outboxWorker?.on('completed', (job) => logEvent('info', 'outbox.worker_completed', { jobId: job.id }));
outboxWorker?.on('failed', (job, error) =>
  logEvent('error', 'outbox.worker_failed', { jobId: job?.id, error: error.message }),
);
reminderWorker?.on('completed', (job) => logEvent('info', 'reminder.worker_completed', { jobId: job.id }));
reminderWorker?.on('failed', (job, error) =>
  logEvent('error', 'reminder.worker_failed', { jobId: job?.id, error: error.message }),
);
campaignWorker?.on('completed', (job) => logEvent('info', 'campaign.worker_completed', { jobId: job.id }));
campaignWorker?.on('failed', (job, error) =>
  logEvent('error', 'campaign.worker_failed', { jobId: job?.id, error: error.message }),
);
importWorker?.on('completed', (job) => logEvent('info', 'import.worker_completed', { jobId: job.id }));
importWorker?.on('failed', (job, error) =>
  logEvent('error', 'import.worker_failed', { jobId: job?.id, error: error.message }),
);
coordinateAuditWorker?.on('completed', (job) =>
  logEvent('info', 'coordinate_audit.worker_completed', { jobId: job.id }),
);
coordinateAuditWorker?.on('failed', (job, error) =>
  logEvent('error', 'coordinate_audit.worker_failed', { jobId: job?.id, error: error.message }),
);

const shutdown = async () => {
  clearInterval(poller);
  await outboxWorker?.close();
  await reminderWorker?.close();
  await campaignWorker?.close();
  await importWorker?.close();
  await campaignMaterializationWorker?.close();
  await recoveryWorker?.close();
  await coordinateAuditWorker?.close();
  await outboxQueue.close();
  await reminderQueue.close();
  await campaignMaterializationQueue.close();
  await campaignSendQueue.close();
  await metricsQueue.close();
  await importQueue.close();
  await coordinateAuditQueue.close();
  if (coordinateGeocoder && 'onModuleDestroy' in coordinateGeocoder)
    await (coordinateGeocoder as { onModuleDestroy?: () => Promise<void> }).onModuleDestroy?.();
  await connection.quit();
  await pool.end();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
