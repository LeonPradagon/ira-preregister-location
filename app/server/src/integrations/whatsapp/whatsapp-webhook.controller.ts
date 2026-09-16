import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { whatsappDeliveryStatusSchema } from '../../common/contracts.js';
import { WhatsAppComplianceService } from './whatsapp-compliance.service.js';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(private readonly compliance: WhatsAppComplianceService) {}

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

export function normalizeDeliveryPayload(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const payload = body as Record<string, unknown>;
  const directProviderMessageId = firstString(
    payload.providerMessageId,
    payload.messageId,
    payload.message_id,
    payload.broadcastId,
    payload.broadcast_id,
    payload.id,
  );
  if (directProviderMessageId) {
    return {
      providerMessageId: directProviderMessageId,
      status: normalizeStatus(payload.status),
      error: formatWebhookError(payload.error, payload.errorCode ?? payload.code),
      errorCode: normalizeErrorCode(payload.errorCode ?? payload.code),
      occurredAt: normalizeTimestamp(payload.occurredAt ?? payload.timestamp ?? payload.createdAt ?? payload.created_at),
    };
  }
  const entry = Array.isArray(payload.entry) ? (payload.entry[0] as Record<string, unknown> | undefined) : undefined;
  const changes =
    entry && Array.isArray(entry.changes) ? (entry.changes[0] as Record<string, unknown> | undefined) : undefined;
  const value = changes && typeof changes.value === 'object' ? (changes.value as Record<string, unknown>) : undefined;
  const status =
    value && Array.isArray(value.statuses) ? (value.statuses[0] as Record<string, unknown> | undefined) : undefined;
  if (!status) return {};
  const firstError = Array.isArray(status.errors)
    ? (status.errors[0] as Record<string, unknown> | undefined)
    : undefined;
  const providerMessageId = firstString(
    status.id,
    status.providerMessageId,
    status.messageId,
    status.message_id,
    status.broadcastId,
    status.broadcast_id,
    status.external_id,
  );
  return {
    providerMessageId,
    status: normalizeStatus(status.status),
    error: formatWebhookError(firstError ?? status.errors, firstError?.code ?? status.code),
    errorCode: normalizeErrorCode(firstError?.code ?? status.code),
    occurredAt: normalizeTimestamp(status.timestamp ?? status.occurredAt ?? status.created_at),
  };
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return normalizeTimestamp(Number(trimmed));
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeErrorCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 64);
  return undefined;
}

function formatWebhookError(value: unknown, code: unknown): string | undefined {
  const errorCode = normalizeErrorCode(code);
  if (typeof value === 'string' && value.trim()) {
    return errorCode && !value.includes(errorCode) ? `[${errorCode}] ${value.trim()}`.slice(0, 500) : value.trim();
  }
  if (!value || typeof value !== 'object') return errorCode ? `[${errorCode}]` : undefined;
  const error = value as Record<string, unknown>;
  const text = [error.title, error.message, error.details]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .join(' | ');
  if (text) return errorCode ? `[${errorCode}] ${text}`.slice(0, 500) : text.slice(0, 500);
  return errorCode ? `[${errorCode}]` : JSON.stringify(value).slice(0, 500);
}

function normalizeStatus(value: unknown): 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | undefined {
  if (typeof value !== 'string') return undefined;
  const status = value.toUpperCase();
  if (status === 'DELIVERED' || status === 'READ' || status === 'FAILED') return status;
  if (status === 'SENT' || status === 'ACCEPTED' || status === 'QUEUED' || status === 'PROCESSING') return 'SENT';
  return undefined;
}
