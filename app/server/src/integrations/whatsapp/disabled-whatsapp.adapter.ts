import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { WhatsAppMessage, WhatsAppPort, WhatsAppSendResult } from './whatsapp.port.js';

@Injectable()
export class DisabledWhatsAppAdapter extends WhatsAppPort {
  send(_message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    return Promise.reject(new ServiceUnavailableException('WhatsApp provider is not configured'));
  }
}
