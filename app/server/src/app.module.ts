import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { PublicVerificationController } from './modules/verification/public-verification.controller.js';
import { AdminController } from './modules/admin/admin.controller.js';
import { VerificationService } from './modules/verification/verification.service.js';
import { AdminService } from './modules/admin/admin.service.js';
import { GeocodingPort } from './integrations/geocoding/geocoding.port.js';
import { createGeocodingAdapter } from './integrations/geocoding/geocoding.adapter.factory.js';
import { WhatsAppPort } from './integrations/whatsapp/whatsapp.port.js';
import { ConsoleWhatsAppAdapter } from './integrations/whatsapp/console-whatsapp.adapter.js';
import { MekariWhatsAppAdapter } from './integrations/whatsapp/mekari-whatsapp.adapter.js';
import { DisabledWhatsAppAdapter } from './integrations/whatsapp/disabled-whatsapp.adapter.js';
import { RolesGuard } from './auth/roles.guard.js';
import { ValidationConfigService } from './config/validation-config.service.js';
import { CampaignController } from './modules/campaigns/campaign.controller.js';
import { CampaignService } from './modules/campaigns/campaign.service.js';
import { WhatsAppComplianceService } from './integrations/whatsapp/whatsapp-compliance.service.js';
import { WhatsAppWebhookController } from './integrations/whatsapp/whatsapp-webhook.controller.js';
import { CustomerImportService } from './modules/imports/customer-import.service.js';
import { RegionsController } from './modules/regions/regions.controller.js';
import { RegionsService } from './modules/regions/regions.service.js';
import { ReadCacheService } from './common/read-cache.service.js';
import { MetricsService } from './common/metrics.service.js';
import { RequestMetricsMiddleware } from './common/request-metrics.middleware.js';
import { RedisRateLimitMiddleware } from './common/redis-rate-limit.middleware.js';

@Module({
  imports: [AuthModule],
  controllers: [
    HealthController,
    PublicVerificationController,
    RegionsController,
    AdminController,
    CampaignController,
    WhatsAppWebhookController,
  ],
  providers: [
    VerificationService,
    AdminService,
    CampaignService,
    WhatsAppComplianceService,
    CustomerImportService,
    RegionsService,
    ReadCacheService,
    MetricsService,
    RequestMetricsMiddleware,
    RedisRateLimitMiddleware,
    ValidationConfigService,
    RolesGuard,
    {
      provide: GeocodingPort,
      useFactory: createGeocodingAdapter,
    },
    {
      provide: WhatsAppPort,
      useFactory: () => {
        const provider = process.env.WHATSAPP_PROVIDER ?? 'disabled';
        if (provider === 'disabled') return new DisabledWhatsAppAdapter();
        if (provider === 'mekari') return new MekariWhatsAppAdapter();
        return process.env.NODE_ENV === 'production' ? new DisabledWhatsAppAdapter() : new ConsoleWhatsAppAdapter();
      },
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestMetricsMiddleware, RedisRateLimitMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
