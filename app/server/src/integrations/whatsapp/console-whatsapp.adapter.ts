import { Injectable } from '@nestjs/common';
import { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './whatsapp.port.js';

@Injectable()
export class ConsoleWhatsAppAdapter extends WhatsAppPort {
  async send(message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    // Safe local adapter: no external request is made until a real provider is configured.
    console.info('[whatsapp:console]', { phoneE164: message.phoneE164, idempotencyKey: message.idempotencyKey });
    return { providerMessageId: `console-${message.idempotencyKey}`, acceptedAt: new Date().toISOString() };
  }
}
