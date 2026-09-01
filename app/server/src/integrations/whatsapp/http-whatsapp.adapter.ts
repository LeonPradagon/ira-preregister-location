import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { providerErrorMessage, providerHttpClient } from '../../common/http/provider-http.client.js';
import { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './whatsapp.port.js';

@Injectable()
export class HttpWhatsAppAdapter extends WhatsAppPort {
  private readonly baseUrl = (process.env.WHATSAPP_BASE_URL ?? '').replace(/\/$/, '');
  private readonly timeoutMs = Number(process.env.WHATSAPP_TIMEOUT_MS ?? 5000);

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    if (!this.baseUrl) throw new ServiceUnavailableException('WhatsApp provider is not configured');
    const templateName = message.templateName || process.env.WHATSAPP_TEMPLATE_NAME;
    if (!templateName) throw new ServiceUnavailableException('WhatsApp approved template is not configured');
    const templateLanguage = 'id';
    try {
      const response = await providerHttpClient.post(`${this.baseUrl}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.phoneE164,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: message.templateParameters?.length ? [{ type: 'body', parameters: message.templateParameters.map((text) => ({ type: 'text', text })) }] : undefined,
          },
        }, {
          timeout: this.timeoutMs,
          headers: process.env.WHATSAPP_API_KEY ? { authorization: `Bearer ${process.env.WHATSAPP_API_KEY}` } : undefined,
        });
      const body = response.data as { providerMessageId?: string; id?: string; acceptedAt?: string; messages?: Array<{ id?: string }> };
      const providerMessageId = body.messages?.[0]?.id || body.providerMessageId || body.id;
      if (!providerMessageId) throw new ServiceUnavailableException('WhatsApp provider did not return a message id');
      return { providerMessageId, acceptedAt: body.acceptedAt || new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (axios.isAxiosError(error) && error.response) {
        throw new ServiceUnavailableException(`WhatsApp provider returned HTTP ${error.response.status}${providerErrorMessage(error) ? `: ${providerErrorMessage(error)}` : ''}`);
      }
      throw new ServiceUnavailableException(`WhatsApp provider unavailable: ${providerErrorMessage(error)}`);
    }
  }
}
