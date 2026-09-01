import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { whatsappDeliveryStatusSchema } from '../../common/contracts.js';
import { WhatsAppComplianceService } from './whatsapp-compliance.service.js';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly compliance: WhatsAppComplianceService) {}

  @Get()
  verifyMetaWebhook(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ) {
    if (mode !== 'subscribe' || !challenge || !process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || verifyToken !== process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      throw new UnauthorizedException('Invalid WhatsApp webhook verification request');
    }
    return challenge;
  }

  @Post()
  async metaWebhook(@Req() request: Request, @Headers('x-hub-signature-256') signature: string | undefined, @Body() body: unknown) {
    assertMetaSignature(request, signature);
    const normalized = normalizeMetaWebhook(body);
    let statusCount = 0;
    let inboundCount = 0;
    for (const status of normalized.statuses) {
      await this.compliance.recordDeliveryStatus(status);
      statusCount += 1;
    }
    for (const message of normalized.messages) {
      await this.compliance.recordInbound(message.phoneE164, message.text);
      inboundCount += 1;
    }
    return { accepted: true, statusCount, inboundCount };
  }

  @Post('inbound')
  async inbound(@Headers('x-whatsapp-webhook-secret') secret: string | undefined, @Body() body: unknown) {
    const configuredSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!configuredSecret || secret !== configuredSecret) throw new UnauthorizedException();
    if (!body || typeof body !== 'object') return { accepted: false };
    const payload = body as { phoneE164?: unknown; text?: unknown };
    if (typeof payload.phoneE164 !== 'string' || typeof payload.text !== 'string') return { accepted: false };
    return { accepted: true, ...(await this.compliance.recordInbound(payload.phoneE164, payload.text)) };
  }

  @Post('status')
  async status(@Headers('x-whatsapp-webhook-secret') secret: string | undefined, @Body() body: unknown) {
    const configuredSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!configuredSecret || secret !== configuredSecret) throw new UnauthorizedException();
    const normalized = normalizeDeliveryPayload(body);
    const parsed = whatsappDeliveryStatusSchema.safeParse(normalized);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.compliance.recordDeliveryStatus(parsed.data);
  }
}

function normalizeDeliveryPayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const payload = body as Record<string, unknown>;
  if (typeof payload.providerMessageId === 'string' || typeof payload.messageId === 'string') {
    return { providerMessageId: payload.providerMessageId ?? payload.messageId, status: normalizeStatus(payload.status), error: payload.error, occurredAt: payload.occurredAt };
  }
  const entry = Array.isArray(payload.entry) ? payload.entry[0] as Record<string, unknown> | undefined : undefined;
  const changes = entry && Array.isArray(entry.changes) ? entry.changes[0] as Record<string, unknown> | undefined : undefined;
  const value = changes && typeof changes.value === 'object' ? changes.value as Record<string, unknown> : undefined;
  const status = value && Array.isArray(value.statuses) ? value.statuses[0] as Record<string, unknown> | undefined : undefined;
  if (!status) return {};
  const firstError = Array.isArray(status.errors) ? status.errors[0] as Record<string, unknown> | undefined : undefined;
  return { providerMessageId: status.id, status: normalizeStatus(status.status), error: typeof status.errors === 'string' ? status.errors : typeof firstError?.title === 'string' ? firstError.title : undefined, occurredAt: typeof status.timestamp === 'string' && /^\d+$/.test(status.timestamp) ? new Date(Number(status.timestamp) * 1000).toISOString() : undefined };
}

function normalizeStatus(value: unknown): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | undefined {
  if (typeof value !== 'string') return undefined;
  const status = value.toUpperCase();
  if (status === 'DELIVERED' || status === 'READ' || status === 'FAILED') return status;
  if (status === 'SENT' || status === 'ACCEPTED' || status === 'QUEUED' || status === 'PROCESSING') return 'SENT';
  return undefined;
}

function assertMetaSignature(request: Request, signature: string | undefined) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
  if (!appSecret || !rawBody || !signature?.startsWith('sha256=')) throw new UnauthorizedException('WhatsApp webhook signature is not configured');
  const actual = Buffer.from(signature.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException('Invalid WhatsApp webhook signature');
}

function normalizeMetaWebhook(body: unknown): {
  statuses: Array<{ providerMessageId: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; error?: string; occurredAt?: string }>;
  messages: Array<{ phoneE164: string; text: string }>;
} {
  const statuses: Array<{ providerMessageId: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; error?: string; occurredAt?: string }> = [];
  const messages: Array<{ phoneE164: string; text: string }> = [];
  if (!body || typeof body !== 'object') return { statuses, messages };
  const payload = body as Record<string, unknown>;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entryValue of entries) {
    if (!entryValue || typeof entryValue !== 'object') continue;
    const rawChanges = (entryValue as Record<string, unknown>).changes;
    const changes = Array.isArray(rawChanges) ? rawChanges : [];
    for (const changeValue of changes) {
      if (!changeValue || typeof changeValue !== 'object') continue;
      const value = (changeValue as Record<string, unknown>).value;
      if (!value || typeof value !== 'object') continue;
      const valueRecord = value as Record<string, unknown>;
      if (Array.isArray(valueRecord.statuses)) {
        for (const statusValue of valueRecord.statuses) {
          if (!statusValue || typeof statusValue !== 'object') continue;
          const status = statusValue as Record<string, unknown>;
          const normalizedStatus = normalizeStatus(status.status);
          if (!normalizedStatus || typeof status.id !== 'string') continue;
          const firstError = Array.isArray(status.errors) ? status.errors[0] as Record<string, unknown> | undefined : undefined;
          statuses.push({
            providerMessageId: status.id,
            status: normalizedStatus,
            error: typeof firstError?.title === 'string' ? firstError.title : undefined,
            occurredAt: typeof status.timestamp === 'string' && /^\d+$/.test(status.timestamp) ? new Date(Number(status.timestamp) * 1000).toISOString() : undefined,
          });
        }
      }
      if (Array.isArray(valueRecord.messages)) {
        for (const messageValue of valueRecord.messages) {
          if (!messageValue || typeof messageValue !== 'object') continue;
          const message = messageValue as Record<string, unknown>;
          const text = message.text;
          if (typeof message.from !== 'string' || !text || typeof text !== 'object' || typeof (text as Record<string, unknown>).body !== 'string') continue;
          messages.push({ phoneE164: message.from.startsWith('+') ? message.from : `+${message.from}`, text: String((text as Record<string, unknown>).body) });
        }
      }
    }
  }
  return { statuses, messages };
}
