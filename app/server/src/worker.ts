import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { db, pool } from './db/client.js';
import { customers, integrationOutbox, reminders, verificationSessions } from './db/schema/index.js';
import { ConsoleWhatsAppAdapter } from './integrations/whatsapp/console-whatsapp.adapter.js';
import { HttpWhatsAppAdapter } from './integrations/whatsapp/http-whatsapp.adapter.js';
import { WhatsAppPort } from './integrations/whatsapp/whatsapp.port.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const outboxQueueName = 'exact-location-outbox';
const reminderQueueName = 'exact-location-reminders';
const outboxQueue = new Queue(outboxQueueName, { connection });
const reminderQueue = new Queue(reminderQueueName, { connection });
const whatsapp: WhatsAppPort = process.env.WHATSAPP_BASE_URL ? new HttpWhatsAppAdapter() : new ConsoleWhatsAppAdapter();

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
      console.info('[outbox:published]', { eventId: event.eventId, eventType: event.eventType, payload: event.payload });
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
    try {
      const sent = await whatsapp.send({ phoneE164: target.customer.phoneE164, messageText: target.reminder.messageText, idempotencyKey: `reminder:${reminderId}` });
      await db.update(reminders).set({ status: 'SENT', sentAt: new Date(), providerMessageId: sent.providerMessageId }).where(eq(reminders.id, reminderId));
    } catch (error) {
      const retryCount = target.reminder.retryCount + 1;
      await db.update(reminders).set({ status: retryCount >= 3 ? 'FAILED' : 'SCHEDULED', retryCount, scheduledAt: retryCount >= 3 ? target.reminder.scheduledAt : new Date(Date.now() + retryCount * 60 * 1000) }).where(eq(reminders.id, reminderId));
      throw error;
    }
  },
  { connection, concurrency: 5 },
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
    .limit(100);
  await Promise.all(due.map((reminder) => reminderQueue.add('send-whatsapp-reminder', { reminderId: reminder.id, sessionId: reminder.sessionId }, { jobId: reminder.id, attempts: 1, removeOnComplete: true, removeOnFail: true })));
};

const poll = async () => {
  await Promise.all([enqueuePendingOutbox(), enqueueDueReminders()]);
};
const poller = setInterval(() => { void poll().catch((error) => console.error('[worker:poller:failed]', error)); }, 5000);
void poll().catch((error) => console.error('[worker:poller:failed]', error));

outboxWorker.on('completed', (job) => console.info('[outbox:worker:completed]', job.id));
outboxWorker.on('failed', (job, error) => console.error('[outbox:worker:failed]', job?.id, error));
reminderWorker.on('completed', (job) => console.info('[reminder:worker:completed]', job.id));
reminderWorker.on('failed', (job, error) => console.error('[reminder:worker:failed]', job?.id, error));

const shutdown = async () => {
  clearInterval(poller);
  await outboxWorker.close();
  await reminderWorker.close();
  await outboxQueue.close();
  await reminderQueue.close();
  await connection.quit();
  await pool.end();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
