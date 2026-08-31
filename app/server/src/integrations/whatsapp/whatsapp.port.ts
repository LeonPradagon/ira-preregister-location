export interface WhatsAppMessage {
  phoneE164: string;
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  messageText?: string;
  idempotencyKey: string;
}

export interface WhatsAppSendResult {
  providerMessageId: string;
  acceptedAt: string;
}

export abstract class WhatsAppPort {
  abstract send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
}
