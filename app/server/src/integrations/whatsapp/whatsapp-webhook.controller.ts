import { Body, Controller, Headers, UnauthorizedException, Post } from '@nestjs/common';
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
}
