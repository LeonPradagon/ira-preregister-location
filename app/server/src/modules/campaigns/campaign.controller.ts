import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { adminListQuerySchema, campaignCreateSchema, whatsappPreviewSchema } from '../../common/contracts.js';
import { BetterAuthGuard } from '../../auth/auth.guard.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { Roles } from '../../common/roles.js';
import { CurrentAdmin, RequestAdmin } from '../../common/request-user.js';
import { CampaignService } from './campaign.service.js';

@Controller('admin/campaigns')
@UseGuards(BetterAuthGuard, RolesGuard)
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Post('preview-whatsapp')
  @Roles('SUPER_ADMIN', 'ADMIN')
  previewWhatsApp(@Body() body: unknown) {
    const parsed = whatsappPreviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.previewWhatsApp(parsed.data);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async create(@CurrentAdmin() admin: RequestAdmin, @Body() body: unknown) {
    const parsed = campaignCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.create(admin, parsed.data);
  }

  @Post(':id/start')
  @Roles('SUPER_ADMIN', 'ADMIN')
  start(@CurrentAdmin() admin: RequestAdmin, @Param('id') id: string) {
    return this.campaigns.start(admin, id);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  list(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.list(parsed.data);
  }

  @Get(':id/export')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  async export(
    @CurrentAdmin() admin: RequestAdmin,
    @Param('id') id: string,
    @Query('format') format = 'xlsx',
    @Res() response: Response,
  ): Promise<void> {
    if (format !== 'xlsx' && format !== 'csv') throw new BadRequestException('Format export harus xlsx atau csv.');
    const result = await this.campaigns.exportCampaign(admin, id, format);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    response.send(result.body);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  detail(@Param('id') id: string) {
    return this.campaigns.detail(id);
  }

  @Get(':id/items')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  items(@Param('id') id: string, @Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.items(id, parsed.data);
  }
}
