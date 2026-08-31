import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { PublicVerificationController } from './modules/verification/public-verification.controller.js';
import { AdminController } from './modules/admin/admin.controller.js';
import { VerificationService } from './modules/verification/verification.service.js';
import { AdminService } from './modules/admin/admin.service.js';
import { GeocodingPort } from './integrations/geocoding/geocoding.port.js';
import { DisabledGeocodingAdapter } from './integrations/geocoding/disabled-geocoding.adapter.js';
import { HttpGeocodingAdapter } from './integrations/geocoding/http-geocoding.adapter.js';
import { WhatsAppPort } from './integrations/whatsapp/whatsapp.port.js';
import { ConsoleWhatsAppAdapter } from './integrations/whatsapp/console-whatsapp.adapter.js';
import { HttpWhatsAppAdapter } from './integrations/whatsapp/http-whatsapp.adapter.js';
import { DisabledWhatsAppAdapter } from './integrations/whatsapp/disabled-whatsapp.adapter.js';
import { RolesGuard } from './auth/roles.guard.js';
import { ValidationConfigService } from './config/validation-config.service.js';
import { CampaignController } from './modules/campaigns/campaign.controller.js';
import { CampaignService } from './modules/campaigns/campaign.service.js';
import { WhatsAppComplianceService } from './integrations/whatsapp/whatsapp-compliance.service.js';
import { WhatsAppWebhookController } from './integrations/whatsapp/whatsapp-webhook.controller.js';
import { CustomerImportService } from './modules/imports/customer-import.service.js';

@Module({
  imports: [AuthModule],
  controllers: [HealthController, PublicVerificationController, AdminController, CampaignController, WhatsAppWebhookController],
  providers: [
    VerificationService,
    AdminService,
    CampaignService,
    WhatsAppComplianceService,
    CustomerImportService,
    ValidationConfigService,
    RolesGuard,
    { provide: GeocodingPort, useFactory: () => process.env.GEOCODING_BASE_URL ? new HttpGeocodingAdapter() : new DisabledGeocodingAdapter() },
    { provide: WhatsAppPort, useFactory: () => process.env.WHATSAPP_BASE_URL && process.env.WHATSAPP_TEMPLATE_NAME ? new HttpWhatsAppAdapter() : process.env.NODE_ENV === 'production' ? new DisabledWhatsAppAdapter() : new ConsoleWhatsAppAdapter() },
  ],
})
export class AppModule {}
