import 'dotenv/config';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Queue, Worker } from 'bullmq';
import { and, desc, eq, gt, inArray, isNull, isNotNull, lte, lt, ne, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { db, pool } from './db/client.js';
import {
  auditLogs,
  customers,
  customerAddresses,
  importJobs,
  integrationOutbox,
  coverageCheckBatches,
  coverageChecks,
  reminders,
  verificationShortLinks,
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
import { createShortLinkCode, hashShortLinkCode } from './modules/verification/short-link.js';
import { CampaignService } from './modules/campaigns/campaign.service.js';
import { ValidationConfigService } from './config/validation-config.service.js';
import { getWhatsAppTemplate } from './integrations/whatsapp/whatsapp.templates.js';
import {
  nextAutomaticReminderAt,
  reminderCancellationAudit,
  reminderCancellationFields,
  reminderLinkExpiresAt,
  reminderScheduleFields,
  sessionExpiryAfterActivity,
  isReusableCancelledReminder,
  shouldScheduleSystemFollowUp,
  verificationStatusAfterReminderSend,
  SYSTEM_FOLLOW_UP_STATUSES,
  unopenedLinkReminderAt,
  verificationSessionExpiresAt,
} from './modules/reminders/reminder.policy.js';
import { CampaignItemState } from './modules/campaigns/campaign-item-state.js';
import { campaignNeedsMaterialization } from './modules/campaigns/campaign-target.policy.js';
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
import { coordinateAuditEnqueueLimit } from './modules/validation/coordinate-audit-queue.policy.js';
import { AdminExportService } from './modules/admin/admin-export.service.js';
import { FwaCoverageAdapter } from './integrations/coverage/fwa-coverage.adapter.js';

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
  exports: exportQueueName,
  coverage: coverageQueueName,
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
const exportQueue = new Queue(exportQueueName, { connection });
const coverageQueue = new Queue(coverageQueueName, { connection });
const adminExportService = runs('maintenance') ? new AdminExportService() : null;
const positiveIntegerEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
};
const coordinateAuditQueueBuffer = positiveIntegerEnv(process.env.COORDINATE_AUDIT_QUEUE_BUFFER, 2000);
const coordinateAuditBatchSize = positiveIntegerEnv(process.env.COORDINATE_AUDIT_BATCH_SIZE, 500);
const reminderProcessingTimeoutMinutes = positiveIntegerEnv(process.env.REMINDER_PROCESSING_TIMEOUT_MINUTES, 15);
const reminderRecoveryIntervalSeconds = positiveIntegerEnv(process.env.REMINDER_RECOVERY_INTERVAL_SECONDS, 60);
const reminderRecoveryBatchSize = positiveIntegerEnv(process.env.REMINDER_RECOVERY_BATCH_SIZE, 50);
const systemFollowUpEnabled = process.env.SYSTEM_FOLLOW_UP_ENABLED !== 'false';
const systemFollowUpDelayHours = positiveIntegerEnv(process.env.SYSTEM_FOLLOW_UP_DELAY_HOURS, 24);
const systemFollowUpIntervalSeconds = positiveIntegerEnv(process.env.SYSTEM_FOLLOW_UP_INTERVAL_SECONDS, 60);
const systemFollowUpBatchSize = positiveIntegerEnv(process.env.SYSTEM_FOLLOW_UP_BATCH_SIZE, 50);
let lastReminderRecoveryBucket = -1;
let lastSystemFollowUpBucket = -1;
let coordinateAuditEnqueueInFlight = false;
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
const fwaCoverage = new FwaCoverageAdapter();

const cancelClaimedReminder = async (
  reminderId: string,
  reason: Parameters<typeof reminderCancellationFields>[0],
) => {
  const cancelledAt = new Date();
  const [cancelled] = await db
    .update(reminders)
    .set({
      ...reminderCancellationFields(reason, cancelledAt, 'system'),
      processingStartedAt: null,
    })
    .where(and(eq(reminders.id, reminderId), eq(reminders.status, 'PROCESSING')))
    .returning({ id: reminders.id });
  if (cancelled)
    await db.insert(auditLogs).values(
      reminderCancellationAudit(cancelled.id, reason, cancelledAt, 'system', 'Reminder Worker'),
    );
};

const enqueuePendingCoordinateAudits = async () => {
  if (!runs('import') || coordinateAuditEnqueueInFlight) return 0;
  coordinateAuditEnqueueInFlight = true;
  try {
    const counts = await coordinateAuditQueue.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'paused');
    const enqueueLimit = Math.min(coordinateAuditBatchSize, coordinateAuditEnqueueLimit(counts, coordinateAuditQueueBuffer));
    if (!enqueueLimit) return 0;
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
      .limit(enqueueLimit);
    if (!pending.length) return 0;
    await coordinateAuditQueue.addBulk(
      pending.map(({ id }) => ({
        name: 'audit-imported-coordinate',
        data: { addressId: id },
        opts: { jobId: queueSafeJobId('coordinate-audit', id), removeOnComplete: true, removeOnFail: false },
      })),
    );
    return pending.length;
  } finally {
    coordinateAuditEnqueueInFlight = false;
  }
};

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
  customerId: string,
  phoneE164: string,
  messageType: string,
  idempotencyKey: string,
  providerMessageId: string,
) => {
  await db
    .insert(whatsappDeliveryLogs)
    .values({
      id: randomUUID(),
      customerId,
      phoneHash: hashPhone(phoneE164),
      messageType,
      idempotencyKey,
      providerMessageId,
      status: 'ACCEPTED',
      sentAt: new Date(),
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: whatsappDeliveryLogs.idempotencyKey });
  await db
    .update(customers)
    .set({ whatsappStatus: 'ACCEPTED', updatedAt: new Date() })
    .where(eq(customers.id, customerId));
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

const coverageWorker = runs('coverage')
  ? new Worker(
      coverageQueueName,
      async (job) => {
        const batchId = String(job.data.batchId);
        const [batch] = await db.select().from(coverageCheckBatches).where(eq(coverageCheckBatches.id, batchId)).limit(1);
        if (!batch || ['COMPLETED', 'PARTIAL_FAILED', 'FAILED'].includes(batch.status)) return;
        const startedAt = new Date();
        await db
          .update(coverageCheckBatches)
          .set({ status: 'PROCESSING', startedAt, updatedAt: startedAt })
          .where(eq(coverageCheckBatches.id, batchId));

        const checks = await db
          .select()
          .from(coverageChecks)
          .where(and(eq(coverageChecks.batchId, batchId), eq(coverageChecks.status, 'QUEUED')))
          .orderBy(coverageChecks.createdAt, coverageChecks.id);
        const batchSize = positiveIntegerEnv(process.env.FWA_COVERAGE_BATCH_SIZE, 100);
        for (let offset = 0; offset < checks.length; offset += batchSize) {
          const chunk = checks.slice(offset, offset + batchSize);
          const chunkIds = chunk.map((check) => check.id);
          await db
            .update(coverageChecks)
            .set({ status: 'PROCESSING', updatedAt: new Date() })
            .where(inArray(coverageChecks.id, chunkIds));
          try {
            const results = await fwaCoverage.checkCoverage(
              chunk.map((check) => ({
                id: check.id,
                latitude: Number(check.latitude),
                longitude: Number(check.longitude),
              })),
            );
            await Promise.all(
              chunk.map((check, index) => {
                const result = results[index];
                if (!result) throw new Error(`Coverage provider did not return result for ${check.id}`);
                return db
                  .update(coverageChecks)
                  .set({
                    status: result.status,
                    providerStatus: result.status,
                    response: { coverageStatus: result.status },
                    error: null,
                    completedAt: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(coverageChecks.id, check.id));
              }),
            );
          } catch (error) {
            const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
            await db
              .update(coverageChecks)
              .set({ status: 'FAILED', error: message, completedAt: new Date(), updatedAt: new Date() })
              .where(inArray(coverageChecks.id, chunkIds));
          }
        }

        const [completedRows, failedRows] = await Promise.all([
          db
            .select({ completedCount: sql<number>`count(*)` })
            .from(coverageChecks)
            .where(and(eq(coverageChecks.batchId, batchId), inArray(coverageChecks.status, ['COVERED', 'UNCOVERED']))),
          db
            .select({ failedCount: sql<number>`count(*)` })
            .from(coverageChecks)
            .where(and(eq(coverageChecks.batchId, batchId), eq(coverageChecks.status, 'FAILED'))),
        ]);
        const completed = Number(completedRows[0]?.completedCount ?? 0);
        const failed = Number(failedRows[0]?.failedCount ?? 0);
        const finalStatus = failed === 0 ? 'COMPLETED' : completed === 0 ? 'FAILED' : 'PARTIAL_FAILED';
        await db
          .update(coverageCheckBatches)
          .set({ status: finalStatus, completedCount: completed, failedCount: failed, completedAt: new Date(), updatedAt: new Date() })
          .where(eq(coverageCheckBatches.id, batchId));
      },
      { connection, concurrency: 2 },
    )
  : null;

const reminderWorker = runs('messaging')
  ? new Worker(
      reminderQueueName,
      async (job) => {
        const reminderId = String(job.data.reminderId);
        const processingStartedAt = new Date();
        const [claimed] = await db
          .update(reminders)
          .set({ status: 'PROCESSING', processingStartedAt })
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
          await cancelClaimedReminder(reminderId, 'SESSION_EXPIRED');
          return;
        }
        if (target.reminder.reminderSource === 'UNOPENED_LINK' && target.session.openedAt) {
          await cancelClaimedReminder(reminderId, 'UNOPENED_LINK_ALREADY_OPENED');
          return;
        }
        if (target.customer.whatsappOptOutAt) {
          await cancelClaimedReminder(reminderId, 'CUSTOMER_OPTED_OUT');
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
              processingStartedAt: null,
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
            .set({ status: 'SCHEDULED', processingStartedAt: null, scheduledAt: safety.retryAt! })
            .where(eq(reminders.id, reminderId));
          return;
        }
        try {
          const verificationToken = await createVerificationToken();
          const runtimeConfig = await reminderConfig.get();
          const reminderTtlHours = runtimeConfig.REMINDER_LINK_TTL_HOURS;
          const shortLinkCode = createShortLinkCode();
          const verificationLink = `${getPublicWebOrigin()}/s/${shortLinkCode}`;
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
          const sessionExpiresAt = sessionExpiryAfterActivity(
            target.session.expiresAt,
            sentAt,
            runtimeConfig.ACTIVE_SESSION_TTL_DAYS,
          );
          const tokenExpiresAt = reminderLinkExpiresAt(sentAt, sessionExpiresAt, reminderTtlHours);
          const nextReminderNumber = target.reminder.reminderNumber + 1;
          const reminderIntervalDays =
            target.reminder.reminderSource === 'UNOPENED_LINK'
              ? runtimeConfig.UNOPENED_LINK_REMINDER_INTERVAL_DAYS
              : undefined;
          const nextScheduledAt =
            nextReminderNumber <= runtimeConfig.MAX_REMINDERS_PER_SESSION
              ? nextAutomaticReminderAt(target.reminder.scheduledAt, sessionExpiresAt, reminderIntervalDays)
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
                expiresAt: sessionExpiresAt,
                reminderCount: nextScheduledAt ? nextReminderNumber : target.session.reminderCount,
                verificationStatus: verificationStatusAfterReminderSend(
                  target.session.verificationStatus,
                  nextScheduledAt,
                  nextReminderNumber,
                  runtimeConfig.MAX_REMINDERS_PER_SESSION,
                ),
                updatedAt: sentAt,
              })
              .where(eq(verificationSessions.id, target.session.id));
            await tx.insert(verificationShortLinks).values({
              sessionId: target.session.id,
              tokenId: verificationToken.tokenId,
              codeHash: hashShortLinkCode(shortLinkCode),
              expiresAt: tokenExpiresAt,
              createdAt: sentAt,
            });
            await tx
              .update(reminders)
              .set({
                status: 'SENT',
                processingStartedAt: null,
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
                reminderSource: target.reminder.reminderSource,
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
          await recordDelivery(
            target.customer.id,
            target.customer.phoneE164,
            'REMINDER',
            `reminder:${reminderId}`,
            sent.providerMessageId,
          );
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
              processingStartedAt: null,
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
          const runtimeConfig = await reminderConfig.get();
          const shortLinkCode = createShortLinkCode();
          const verificationLink = `${getPublicWebOrigin()}/s/${shortLinkCode}`;
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
          const sentAt = new Date();
          const initialLinkExpiresAt = new Date(sentAt.getTime() + runtimeConfig.VERIFICATION_TOKEN_TTL_DAYS * 86400000);
          const sessionExpiresAt = verificationSessionExpiresAt(
            initialLinkExpiresAt,
            runtimeConfig.MAX_REMINDERS_PER_SESSION,
            runtimeConfig.REMINDER_LINK_TTL_HOURS,
            runtimeConfig.UNOPENED_LINK_REMINDER_DELAY_DAYS,
            runtimeConfig.UNOPENED_LINK_REMINDER_INTERVAL_DAYS,
          );
          const unopenedReminderAt = unopenedLinkReminderAt(
            initialLinkExpiresAt,
            runtimeConfig.UNOPENED_LINK_REMINDER_DELAY_DAYS,
          );
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
                expiresAt: sessionExpiresAt,
                verificationStatus: 'MESSAGE_SENT',
                updatedAt: sentAt,
              })
              .where(eq(verificationSessions.id, target.session.id));
            await tx.insert(verificationShortLinks).values({
              sessionId: target.session.id,
              tokenId: verificationToken.tokenId,
              codeHash: hashShortLinkCode(shortLinkCode),
              expiresAt: initialLinkExpiresAt,
              createdAt: sentAt,
            });
            if (runtimeConfig.ENABLE_REMINDERS && runtimeConfig.MAX_REMINDERS_PER_SESSION > 0) {
              const reminderId = randomUUID();
              await tx.insert(reminders).values({
                id: reminderId,
                sessionId: target.session.id,
                reminderNumber: 1,
                channel: 'WHATSAPP',
                scheduledAt: unopenedReminderAt,
                status: 'SCHEDULED',
                reminderSource: 'UNOPENED_LINK',
                messageText: `Halo ${target.customer.name}, pengingat 1 dari ${runtimeConfig.MAX_REMINDERS_PER_SESSION}. Tautan baru berlaku maksimal ${runtimeConfig.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`,
                retryCount: 0,
                createdAt: sentAt,
              });
              await tx.insert(auditLogs).values({
                actorUserId: 'system',
                actorName: 'Reminder Scheduler',
                action: 'REMINDER_SCHEDULED',
                entityType: 'REMINDER',
                entityId: reminderId,
                after: {
                  reminderNumber: 1,
                  scheduledAt: unopenedReminderAt.toISOString(),
                  automaticSchedule: true,
                  trigger: 'INITIAL_LINK_EXPIRED_UNOPENED',
                },
                timestamp: sentAt,
              });
            }
          });
          await recordProviderOutcome(true);
          await CampaignItemState.markSent(itemId, sent.providerMessageId, sentAt);
          await recordDelivery(
            target.customer.id,
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
            timestamp: sentAt,
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
          const coordinateAuditsQueued = await enqueuePendingCoordinateAudits();
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
              coordinateAuditsQueued,
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
              const cancelledReminders = await tx
                .update(reminders)
                .set({
                  ...reminderCancellationFields('COORDINATE_AUDIT_AUTO_VERIFIED', auditedAt, 'system'),
                  processingStartedAt: null,
                })
                .where(and(inArray(reminders.sessionId, sessionIds), eq(reminders.status, 'SCHEDULED')))
                .returning({ id: reminders.id });
              if (cancelledReminders.length)
                await tx.insert(auditLogs).values(
                  cancelledReminders.map(({ id }) =>
                    reminderCancellationAudit(
                      id,
                      'COORDINATE_AUDIT_AUTO_VERIFIED',
                      auditedAt,
                      'system',
                      'Coordinate Audit Worker',
                    ),
                  ),
                );
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

const exportWorker = runs('maintenance')
  ? new Worker(
      exportQueueName,
      async (job) => {
        if (job.name === 'process-customer-export') {
          await adminExportService!.processJob(String(job.data.exportJobId));
        }
      },
      { connection, concurrency: Number(process.env.EXPORT_WORKER_CONCURRENCY ?? 1) },
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

const recoverStaleReminderProcessing = async () => {
  const staleBefore = new Date(Date.now() - reminderProcessingTimeoutMinutes * 60 * 1000);
  const recovered = await db
    .update(reminders)
    .set({ status: 'SCHEDULED', scheduledAt: new Date(), processingStartedAt: null })
    .where(
      and(
        eq(reminders.status, 'PROCESSING'),
        or(isNull(reminders.processingStartedAt), lt(reminders.processingStartedAt, staleBefore)),
      ),
    )
    .returning({ id: reminders.id });
  if (recovered.length)
    logEvent('info', 'reminder.processing_recovered', {
      count: recovered.length,
      timeoutMinutes: reminderProcessingTimeoutMinutes,
    });
};

const recoverExpiredAutomaticReminderSlots = async () => {
  if (!runs('messaging')) return;
  const runtimeConfig = await reminderConfig.get();
  if (!runtimeConfig.ENABLE_REMINDERS) return;
  const recoveryStartedAt = new Date();
  const candidates = await db
    .select({ id: verificationSessions.id, customerName: customers.name })
    .from(verificationSessions)
    .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
    .innerJoin(
      reminders,
      and(
        eq(reminders.sessionId, verificationSessions.id),
        eq(reminders.reminderNumber, 2),
        eq(reminders.status, 'SENT'),
        inArray(reminders.reminderSource, ['SYSTEM_RECOVERY', 'UNOPENED_LINK']),
      ),
    )
    .where(
      and(
        lte(verificationSessions.expiresAt, recoveryStartedAt),
        inArray(verificationSessions.verificationStatus, SYSTEM_FOLLOW_UP_STATUSES),
        isNull(verificationSessions.revokedAt),
        sql`not exists (
          select 1
          from reminders reminder_3
          where reminder_3.session_id = ${verificationSessions.id}
            and reminder_3.reminder_number = 3
        )`,
      ),
    )
    .orderBy(verificationSessions.updatedAt, verificationSessions.id)
    .limit(reminderRecoveryBatchSize);
  let recovered = 0;
  for (const candidate of candidates) {
    try {
      const didRecover = await db.transaction(async (tx) => {
        const [session] = await tx
          .select({
            id: verificationSessions.id,
            expiresAt: verificationSessions.expiresAt,
            reminderCount: verificationSessions.reminderCount,
          })
          .from(verificationSessions)
          .where(
            and(
              eq(verificationSessions.id, candidate.id),
              lte(verificationSessions.expiresAt, recoveryStartedAt),
              inArray(verificationSessions.verificationStatus, SYSTEM_FOLLOW_UP_STATUSES),
              isNull(verificationSessions.revokedAt),
              sql`not exists (
                select 1
                from reminders reminder_3
                where reminder_3.session_id = ${verificationSessions.id}
                  and reminder_3.reminder_number = 3
              )`,
            ),
          )
          .limit(1);
        if (!session) return false;

        const expiresAt = sessionExpiryAfterActivity(
          session.expiresAt,
          recoveryStartedAt,
          runtimeConfig.ACTIVE_SESSION_TTL_DAYS,
        );
        const messageText = `Halo ${candidate.customerName}, silakan melanjutkan pemeriksaan lokasi Anda. Pengingat 3 dari ${runtimeConfig.MAX_REMINDERS_PER_SESSION}. Tautan baru berlaku maksimal ${runtimeConfig.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`;
        const [created] = await tx
          .insert(reminders)
          .values({
            id: randomUUID(),
            sessionId: session.id,
            reminderNumber: 3,
            ...reminderScheduleFields('SYSTEM_RECOVERY', recoveryStartedAt, messageText),
            createdAt: recoveryStartedAt,
          })
          .onConflictDoNothing({ target: [reminders.sessionId, reminders.reminderNumber] })
          .returning({ id: reminders.id });
        if (!created) return false;

        await tx
          .update(verificationSessions)
          .set({
            expiresAt,
            reminderCount: Math.max(session.reminderCount, runtimeConfig.MAX_REMINDERS_PER_SESSION),
            updatedAt: recoveryStartedAt,
          })
          .where(eq(verificationSessions.id, session.id));
        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Expired Reminder Recovery',
          action: 'REMINDER_SCHEDULED',
          entityType: 'REMINDER',
          entityId: created.id,
          after: {
            reminderNumber: 3,
            automaticRecovery: true,
            legacyExpiredSession: true,
            expiresAt: expiresAt.toISOString(),
          },
          timestamp: recoveryStartedAt,
        });
        return true;
      });
      if (didRecover) recovered += 1;
    } catch (error) {
      logEvent('error', 'reminder.expired_recovery_failed', {
        sessionId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (recovered) logEvent('info', 'reminder.expired_slots_recovered', { count: recovered });
};

const recoverMissingReminderSlots = async () => {
  const recoveryBucket = Math.floor(Date.now() / (reminderRecoveryIntervalSeconds * 1000));
  if (recoveryBucket === lastReminderRecoveryBucket) return;
  lastReminderRecoveryBucket = recoveryBucket;
  const runtimeConfig = await reminderConfig.get();
  if (!runtimeConfig.ENABLE_REMINDERS) return;
  const recoveryStartedAt = new Date();
  const candidates = await db
    .select({ id: verificationSessions.id, customerName: customers.name })
    .from(verificationSessions)
    .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
    .where(
      and(
        eq(verificationSessions.verificationStatus, 'REMINDER_REQUIRED'),
        lt(verificationSessions.reminderCount, runtimeConfig.MAX_REMINDERS_PER_SESSION),
        gt(verificationSessions.expiresAt, recoveryStartedAt),
        isNull(verificationSessions.revokedAt),
        sql`not exists (
          select 1
          from reminders active_reminder
          where active_reminder.session_id = ${verificationSessions.id}
            and active_reminder.status in ('SCHEDULED', 'PROCESSING')
        )`,
      ),
    )
    .orderBy(verificationSessions.updatedAt, verificationSessions.id)
    .limit(reminderRecoveryBatchSize);
  let recovered = 0;
  for (const candidate of candidates) {
    try {
      const didRecover = await db.transaction(async (tx) => {
        const [session] = await tx
          .select({
            id: verificationSessions.id,
            reminderCount: verificationSessions.reminderCount,
          })
          .from(verificationSessions)
          .where(
            and(
              eq(verificationSessions.id, candidate.id),
              eq(verificationSessions.verificationStatus, 'REMINDER_REQUIRED'),
              lt(verificationSessions.reminderCount, runtimeConfig.MAX_REMINDERS_PER_SESSION),
              gt(verificationSessions.expiresAt, new Date()),
              isNull(verificationSessions.revokedAt),
            ),
          )
          .limit(1);
        if (!session) return false;

        const reminderNumber = session.reminderCount + 1;
        const [existingReminder] = await tx
          .select({
            id: reminders.id,
            status: reminders.status,
            sentAt: reminders.sentAt,
            tokenId: reminders.tokenId,
          })
          .from(reminders)
          .where(and(eq(reminders.sessionId, session.id), eq(reminders.reminderNumber, reminderNumber)))
          .limit(1);
        const messageText = `Halo ${candidate.customerName}, ini pengingat verifikasi lokasi Anda. Pengingat ${reminderNumber} dari ${runtimeConfig.MAX_REMINDERS_PER_SESSION}. Tautan baru berlaku maksimal ${runtimeConfig.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`;
        const reusable = Boolean(
          existingReminder &&
            isReusableCancelledReminder(existingReminder.status, existingReminder.sentAt, existingReminder.tokenId),
        );
        if (existingReminder && !reusable) return false;

        let reminderId: string | undefined;
        if (reusable) {
          const [updated] = await tx
            .update(reminders)
            .set(reminderScheduleFields('SYSTEM_RECOVERY', recoveryStartedAt, messageText))
            .where(
              and(
                eq(reminders.id, existingReminder!.id),
                eq(reminders.status, 'CANCELLED'),
                isNull(reminders.sentAt),
                isNull(reminders.tokenId),
              ),
            )
            .returning({ id: reminders.id });
          reminderId = updated?.id;
        } else {
          const [created] = await tx
            .insert(reminders)
            .values({
              id: randomUUID(),
              sessionId: session.id,
              reminderNumber,
              ...reminderScheduleFields('SYSTEM_RECOVERY', recoveryStartedAt, messageText),
              createdAt: recoveryStartedAt,
            })
            .onConflictDoNothing({ target: [reminders.sessionId, reminders.reminderNumber] })
            .returning({ id: reminders.id });
          reminderId = created?.id;
        }
        if (!reminderId) return false;

        await tx
          .update(verificationSessions)
          .set({
            reminderCount: reminderNumber,
            verificationStatus:
              reminderNumber >= runtimeConfig.MAX_REMINDERS_PER_SESSION
                ? 'REMINDER_LIMIT_REACHED'
                : 'WAITING_FOR_HOME',
            updatedAt: recoveryStartedAt,
          })
          .where(eq(verificationSessions.id, session.id));
        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Reminder Recovery',
          action: 'REMINDER_SCHEDULED',
          entityType: 'REMINDER',
          entityId: reminderId,
          after: { reminderNumber, automaticRecovery: true, reusedCancelledReminder: reusable },
          timestamp: recoveryStartedAt,
        });
        return true;
      });
      if (didRecover) recovered += 1;
    } catch (error) {
      logEvent('error', 'reminder.recovery_failed', {
        sessionId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (recovered) logEvent('info', 'reminder.recovered_missing_slots', { count: recovered });
};

const scheduleStaleCustomerFollowUps = async () => {
  if (!runs('messaging') || !systemFollowUpEnabled) return;
  const followUpBucket = Math.floor(Date.now() / (systemFollowUpIntervalSeconds * 1000));
  if (followUpBucket === lastSystemFollowUpBucket) return;
  lastSystemFollowUpBucket = followUpBucket;

  const runtimeConfig = await reminderConfig.get();
  if (!runtimeConfig.ENABLE_REMINDERS) return;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - systemFollowUpDelayHours * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: verificationSessions.id,
      customerName: customers.name,
      status: verificationSessions.verificationStatus,
      reminderCount: verificationSessions.reminderCount,
      expiresAt: verificationSessions.expiresAt,
      updatedAt: verificationSessions.updatedAt,
    })
    .from(verificationSessions)
    .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
    .where(
      and(
        inArray(verificationSessions.verificationStatus, SYSTEM_FOLLOW_UP_STATUSES),
        lt(verificationSessions.updatedAt, staleBefore),
        gt(verificationSessions.expiresAt, now),
        isNull(verificationSessions.revokedAt),
        lt(verificationSessions.reminderCount, runtimeConfig.MAX_REMINDERS_PER_SESSION),
        isNull(customers.whatsappOptOutAt),
        sql`not exists (
          select 1
          from reminders active_reminder
          where active_reminder.session_id = ${verificationSessions.id}
            and active_reminder.status in ('SCHEDULED', 'PROCESSING')
        )`,
      ),
    )
    .orderBy(verificationSessions.updatedAt, verificationSessions.id)
    .limit(systemFollowUpBatchSize);

  let scheduled = 0;
  for (const candidate of candidates) {
    try {
      const didSchedule = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ session: verificationSessions, whatsappOptOutAt: customers.whatsappOptOutAt })
          .from(verificationSessions)
          .innerJoin(customers, eq(customers.id, verificationSessions.customerId))
          .where(eq(verificationSessions.id, candidate.id))
          .limit(1);
        if (!current) return false;

        const [activeReminder] = await tx
          .select({ id: reminders.id })
          .from(reminders)
          .where(
            and(
              eq(reminders.sessionId, candidate.id),
              inArray(reminders.status, ['SCHEDULED', 'PROCESSING']),
            ),
          )
          .limit(1);
        if (
          !shouldScheduleSystemFollowUp(
            {
              status: current.session.verificationStatus,
              reminderCount: current.session.reminderCount,
              maxReminders: runtimeConfig.MAX_REMINDERS_PER_SESSION,
              updatedAt: current.session.updatedAt,
              expiresAt: current.session.expiresAt,
              now,
              hasActiveReminder: Boolean(activeReminder),
              whatsappOptedOut: Boolean(current.whatsappOptOutAt),
            },
            systemFollowUpDelayHours,
          )
        )
          return false;

        const reminderNumber = current.session.reminderCount + 1;
        const [existingReminder] = await tx
          .select({
            id: reminders.id,
            status: reminders.status,
            sentAt: reminders.sentAt,
            tokenId: reminders.tokenId,
            retryCount: reminders.retryCount,
          })
          .from(reminders)
          .where(
            and(eq(reminders.sessionId, candidate.id), eq(reminders.reminderNumber, reminderNumber)),
          )
          .limit(1);
        const reason =
          current.session.verificationStatus === 'ADDRESS_EDITING' ||
          current.session.verificationStatus === 'ADDRESS_PROPOSED'
            ? 'melanjutkan pembaruan alamat'
            : current.session.verificationStatus === 'LOCATION_MISMATCH' ||
                current.session.verificationStatus === 'LOW_GPS_ACCURACY'
              ? 'mengambil lokasi GPS ulang'
              : 'melanjutkan pemeriksaan lokasi';
        const messageText = `Halo ${candidate.customerName}, silakan ${reason}. Pengingat ${reminderNumber} dari ${runtimeConfig.MAX_REMINDERS_PER_SESSION}. Tautan baru berlaku maksimal ${runtimeConfig.REMINDER_LINK_TTL_HOURS} jam setelah dikirim.`;
        const reusableCancelled = Boolean(
          existingReminder &&
            isReusableCancelledReminder(existingReminder.status, existingReminder.sentAt, existingReminder.tokenId),
        );
        const retryFailed = existingReminder?.status === 'FAILED';
        if (existingReminder && !reusableCancelled && !retryFailed) return false;

        let reminderId: string | undefined;
        if (reusableCancelled || retryFailed) {
          const [updated] = await tx
            .update(reminders)
            .set(reminderScheduleFields('SYSTEM_RECOVERY', now, messageText))
            .where(eq(reminders.id, existingReminder!.id))
            .returning({ id: reminders.id });
          reminderId = updated?.id;
        } else {
          const [created] = await tx
            .insert(reminders)
            .values({
              id: randomUUID(),
              sessionId: candidate.id,
              reminderNumber,
              ...reminderScheduleFields('SYSTEM_RECOVERY', now, messageText),
              createdAt: now,
            })
            .onConflictDoNothing({ target: [reminders.sessionId, reminders.reminderNumber] })
            .returning({ id: reminders.id });
          reminderId = created?.id;
        }
        if (!reminderId) return false;

        const [updatedSession] = await tx
          .update(verificationSessions)
          .set({ reminderCount: Math.max(current.session.reminderCount, reminderNumber), updatedAt: now })
          .where(
            and(
              eq(verificationSessions.id, candidate.id),
              eq(verificationSessions.verificationStatus, current.session.verificationStatus),
              eq(verificationSessions.reminderCount, current.session.reminderCount),
              lt(verificationSessions.updatedAt, staleBefore),
            ),
          )
          .returning({ id: verificationSessions.id });
        if (!updatedSession) return false;

        await tx.insert(auditLogs).values({
          actorUserId: 'system',
          actorName: 'Reminder Follow-up',
          action: 'REMINDER_SCHEDULED',
          entityType: 'REMINDER',
          entityId: reminderId,
          after: {
            reminderNumber,
            automaticFollowUp: true,
            trigger: 'STALE_CUSTOMER_ACTION',
            source: 'SYSTEM_RECOVERY',
            sessionStatus: current.session.verificationStatus,
            reusedCancelledReminder: reusableCancelled,
            retriedFailedReminder: retryFailed,
          },
          timestamp: now,
        });
        return true;
      });
      if (didSchedule) scheduled += 1;
    } catch (error) {
      logEvent('error', 'reminder.follow_up_failed', {
        sessionId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (scheduled) logEvent('info', 'reminder.follow_ups_scheduled', { count: scheduled });
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
    .select({
      id: verificationCampaigns.id,
      cursor: verificationCampaigns.materializationCursor,
      materializationComplete: verificationCampaigns.materializationComplete,
      materializedCount: verificationCampaigns.materializedCount,
      targetCount: verificationCampaigns.targetCount,
    })
    .from(verificationCampaigns)
    .where(
      and(
        eq(verificationCampaigns.status, 'RUNNING'),
        or(
          eq(verificationCampaigns.materializationComplete, false),
          lt(verificationCampaigns.materializedCount, verificationCampaigns.targetCount),
        ),
      ),
    )
    .orderBy(verificationCampaigns.updatedAt, verificationCampaigns.id)
    .limit(20);
  await Promise.all(
    campaignsToMaterialize
      .filter((campaign) =>
        campaignNeedsMaterialization(
          campaign.materializationComplete,
          campaign.materializedCount,
          campaign.targetCount,
        ),
      )
      .map((campaign) =>
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
      sql`ANALYZE customers, customer_addresses, verification_sessions, verification_campaign_items, reminders, audit_logs, integration_outbox, export_jobs, coverage_check_batches, coverage_checks`,
    );
  await adminExportService?.cleanupExpiredJobs();
};

const poll = async () => {
  const jobs: Promise<unknown>[] = [];
  if (runs('messaging'))
    jobs.push(
      enqueuePendingOutbox(),
      recoverStaleReminderProcessing(),
      recoverExpiredAutomaticReminderSlots(),
      recoverMissingReminderSlots(),
      scheduleStaleCustomerFollowUps(),
      enqueueDueReminders(),
    );
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
exportWorker?.on('completed', (job) => logEvent('info', 'export.worker_completed', { jobId: job.id }));
exportWorker?.on('failed', (job, error) =>
  logEvent('error', 'export.worker_failed', { jobId: job?.id, error: error.message }),
);
coverageWorker?.on('completed', (job) => logEvent('info', 'coverage.worker_completed', { jobId: job.id }));
coverageWorker?.on('failed', (job, error) =>
  logEvent('error', 'coverage.worker_failed', { jobId: job?.id, error: error.message }),
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
  await exportWorker?.close();
  await coverageWorker?.close();
  await outboxQueue.close();
  await reminderQueue.close();
  await campaignMaterializationQueue.close();
  await campaignSendQueue.close();
  await metricsQueue.close();
  await importQueue.close();
  await coordinateAuditQueue.close();
  await exportQueue.close();
  await coverageQueue.close();
  await adminExportService?.onModuleDestroy();
  if (coordinateGeocoder && 'onModuleDestroy' in coordinateGeocoder)
    await (coordinateGeocoder as { onModuleDestroy?: () => Promise<void> }).onModuleDestroy?.();
  await connection.quit();
  await pool.end();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
