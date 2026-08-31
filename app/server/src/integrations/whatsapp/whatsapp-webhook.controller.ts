import { BadRequestException, Body, Controller, Headers, UnauthorizedException, Post } from '@nestjs/common';
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
  return { providerMessageId: status.id, status: normalizeStatus(status.status), error: typeof status.errors === 'string' ? status.errors : undefined, occurredAt: typeof status.timestamp === 'string' && /^\d+$/.test(status.timestamp) ? new Date(Number(status.timestamp) * 1000).toISOString() : undefined };
}

function normalizeStatus(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const status = value.toUpperCase();
  if (status === 'DELIVERED' || status === 'READ' || status === 'FAILED') return status;
  if (status === 'SENT' || status === 'ACCEPTED' || status === 'QUEUED' || status === 'PROCESSING') return 'SENT';
  return undefined;
}
