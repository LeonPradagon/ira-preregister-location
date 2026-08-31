import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { adminListQuerySchema, campaignCreateSchema } from '../../common/contracts.js';
import { BetterAuthGuard } from '../../auth/auth.guard.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { Roles } from '../../common/roles.js';
import { CurrentAdmin, RequestAdmin } from '../../common/request-user.js';
import { CampaignService } from './campaign.service.js';

@Controller('admin/campaigns')
@UseGuards(BetterAuthGuard, RolesGuard)
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async create(@CurrentAdmin() admin: RequestAdmin, @Body() body: unknown) {
    const parsed = campaignCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.create(admin, parsed.data);
  }

  @Post(':id/start')
  @Roles('SUPER_ADMIN', 'ADMIN')
  start(@CurrentAdmin() admin: RequestAdmin, @Param('id') id: string) { return this.campaigns.start(admin, id); }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  list(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.list(parsed.data);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  detail(@Param('id') id: string) { return this.campaigns.detail(id); }

  @Get(':id/items')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  items(@Param('id') id: string) { return this.campaigns.items(id); }
}
