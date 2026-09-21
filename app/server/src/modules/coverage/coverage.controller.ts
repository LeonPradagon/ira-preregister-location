import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { BetterAuthGuard } from '../../auth/auth.guard.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { Roles } from '../../common/roles.js';
import { CurrentAdmin, type RequestAdmin } from '../../common/request-user.js';
import { coverageCandidateQuerySchema, coverageCheckCreateSchema } from '../../common/contracts.js';
import { CoverageService } from './coverage.service.js';

const batchIdSchema = z.string().uuid();

@Controller('admin/coverage')
@UseGuards(BetterAuthGuard, RolesGuard)
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  @Get('candidates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  candidates(@Query() query: unknown) {
    const parsed = coverageCandidateQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.coverage.listCandidates(parsed.data);
  }

  @Post('checks')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER')
  enqueue(@CurrentAdmin() admin: RequestAdmin, @Body() body: unknown) {
    const parsed = coverageCheckCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.coverage.enqueue(admin, parsed.data);
  }

  @Get('batches/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  batch(@Param('id') id: string) {
    const parsed = batchIdSchema.safeParse(id);
    if (!parsed.success) throw new BadRequestException('Coverage batch ID tidak valid.');
    return this.coverage.getBatch(parsed.data);
  }
}
