import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { providerErrorMessage, providerHttpClient } from '../../common/http/provider-http.client.js';
import { createMekariDigest, createMekariHmacHeaders } from './mekari-hmac.js';
import { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './whatsapp.port.js';

const directBroadcastPath = '/broadcasts/whatsapp/direct';

function toQontakNumber(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function configuredParameterNames(message: WhatsAppMessage): string[] {
  if (message.templateParameterNames?.length) return message.templateParameterNames;
  return (process.env.WHATSAPP_TEMPLATE_PARAMETER_NAMES ?? 'name,link')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function extractProviderMessageId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = body as Record<string, unknown>;
  const directKeys = ['id', 'message_id', 'broadcast_id', 'broadcastLogId'];
  for (const key of directKeys) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  for (const key of ['data', 'result', 'message', 'broadcast']) {
    const nested = extractProviderMessageId(value[key]);
    if (nested) return nested;
  }
  return undefined;
}

@Injectable()
export class MekariWhatsAppAdapter extends WhatsAppPort {
  private readonly baseUrl = (process.env.WHATSAPP_BASE_URL ?? 'https://api.mekari.com/qontak/chat/v1').replace(
    /\/$/,
    '',
  );
  private readonly timeoutMs = Number(process.env.WHATSAPP_TIMEOUT_MS ?? 5000);
  private readonly clientId = process.env.WHATSAPP_MEKARI_CLIENT_ID;
  private readonly clientSecret = process.env.WHATSAPP_MEKARI_CLIENT_SECRET;
  private readonly channelIntegrationId = process.env.WHATSAPP_CHANNEL_INTEGRATION_ID;

  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const messageTemplateId = message.messageTemplateId || process.env.WHATSAPP_MESSAGE_TEMPLATE_ID;
    if (!this.clientId || !this.clientSecret)
      throw new ServiceUnavailableException('Mekari HMAC credentials are not configured');
    if (!messageTemplateId)
      throw new ServiceUnavailableException('Qontak WhatsApp message template id is not configured');
    if (!this.channelIntegrationId)
      throw new ServiceUnavailableException('Qontak WhatsApp channel integration id is not configured');
    if (!message.recipientName) throw new ServiceUnavailableException('WhatsApp recipient name is required for Qontak');

    const body: Record<string, unknown> = {
      to_name: message.recipientName,
      to_number: toQontakNumber(message.phoneE164),
      message_template_id: messageTemplateId,
      channel_integration_id: this.channelIntegrationId,
      language: { code: message.templateLanguage || 'id' },
      parameters: {
        buttons: [],
        body: (message.templateParameters ?? []).map((value, index) => ({
          key: String(index + 1),
          value: configuredParameterNames(message)[index] ?? `param_${index + 1}`,
          value_text: value,
        })),
      },
    };

    const url = `${this.baseUrl}${directBroadcastPath}`;
    const serializedBody = JSON.stringify(body);
    try {
      const parsedUrl = new URL(url);
      const response = await providerHttpClient.post(url, serializedBody, {
        timeout: this.timeoutMs,
        headers: {
          ...createMekariHmacHeaders({
            method: 'POST',
            pathWithQuery: `${parsedUrl.pathname}${parsedUrl.search}`,
            clientId: this.clientId,
            clientSecret: this.clientSecret,
          }),
          digest: createMekariDigest(serializedBody),
        },
      });
      const providerMessageId = extractProviderMessageId(response.data);
      if (!providerMessageId) throw new ServiceUnavailableException('Qontak provider did not return a broadcast id');
      return { providerMessageId, acceptedAt: new Date().toISOString() };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (axios.isAxiosError(error) && error.response) {
        throw new ServiceUnavailableException(
          `Qontak provider returned HTTP ${error.response.status}${providerErrorMessage(error) ? `: ${providerErrorMessage(error)}` : ''}`,
        );
      }
      throw new ServiceUnavailableException(`Qontak provider unavailable: ${providerErrorMessage(error)}`);
    }
  }
}
