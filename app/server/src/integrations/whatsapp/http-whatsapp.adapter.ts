import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './whatsapp.port.js';

@Injectable()
export class HttpWhatsAppAdapter extends WhatsAppPort {
  private readonly baseUrl = (process.env.WHATSAPP_BASE_URL ?? '').replace(/\/$/, '');
  private readonly timeoutMs = Number(process.env.WHATSAPP_TIMEOUT_MS ?? 5000);

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    if (!this.baseUrl) throw new ServiceUnavailableException('WhatsApp provider is not configured');
    const templateName = message.templateName || process.env.WHATSAPP_TEMPLATE_NAME;
    if (!templateName) throw new ServiceUnavailableException('WhatsApp approved template is not configured');
    const templateLanguage = message.templateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'id';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(process.env.WHATSAPP_API_KEY ? { authorization: `Bearer ${process.env.WHATSAPP_API_KEY}` } : {}) },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.phoneE164,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: message.templateParameters?.length ? [{ type: 'body', parameters: message.templateParameters.map((text) => ({ type: 'text', text })) }] : undefined,
          },
          idempotencyKey: message.idempotencyKey,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new ServiceUnavailableException(`WhatsApp provider returned HTTP ${response.status}`);
      const body = await response.json() as { providerMessageId?: string; id?: string; acceptedAt?: string };
      const providerMessageId = body.providerMessageId || body.id;
      if (!providerMessageId) throw new ServiceUnavailableException('WhatsApp provider did not return a message id');
      return { providerMessageId, acceptedAt: body.acceptedAt || new Date().toISOString() };
    } finally {
      clearTimeout(timeout);
    }
  }
}
