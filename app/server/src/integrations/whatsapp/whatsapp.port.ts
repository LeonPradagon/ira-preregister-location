export interface WhatsAppMessage {
  phoneE164: string;
  messageText: string;
  idempotencyKey: string;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
  acceptedAt: string;
}

export abstract class WhatsAppPort {
  abstract send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}
