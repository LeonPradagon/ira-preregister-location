export interface WhatsAppMessage {
  phoneE164: string;
  recipientName?: string;
  templateName?: string;
  messageTemplateId?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  templateParameterNames?: string[];
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
