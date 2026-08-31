import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { adminListQuerySchema, customerCreateSchema, customerListQuerySchema, reviewSchema, validationConfigSchema } from '../../common/contracts.js';
import { CurrentAdmin, RequestAdmin } from '../../common/request-user.js';
import { BetterAuthGuard } from '../../auth/auth.guard.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { Roles } from '../../common/roles.js';
import { AdminService } from './admin.service.js';
import { z } from 'zod';
import { WhatsAppComplianceService } from '../../integrations/whatsapp/whatsapp-compliance.service.js';
import { CustomerImportService } from '../imports/customer-import.service.js';
import type { UploadedCustomerFile } from '../imports/customer-import.service.js';

const createVerificationSchema = z.object({ addressId: z.string().uuid() });

@Controller('admin')
@UseGuards(BetterAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly whatsappCompliance: WhatsAppComplianceService, private readonly customerImport: CustomerImportService) {}

  @Get('me')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  me(@CurrentAdmin() currentAdmin: RequestAdmin) { return this.admin.me(currentAdmin); }

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  dashboard() { return this.admin.dashboard(); }

  @Get('customers')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  customers(@Query() query: unknown) {
    const parsed = customerListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.listCustomers(parsed.data);
  }

  @Post('customers/import')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: tmpdir(), filename: (_request, file, callback) => callback(null, `exact-location-upload-${randomUUID()}${file.originalname.slice(file.originalname.lastIndexOf('.'))}`) }), limits: { fileSize: 50 * 1024 * 1024 } }))
  importCustomers(@CurrentAdmin() currentAdmin: RequestAdmin, @UploadedFile() file: UploadedCustomerFile) {
    if (!file) throw new BadRequestException('Pilih file .xlsx atau .csv terlebih dahulu.');
    return this.customerImport.import(currentAdmin, file);
  }

  @Post('customers')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createCustomer(@CurrentAdmin() currentAdmin: RequestAdmin, @Body() body: unknown) {
    const parsed = customerCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.createCustomer(currentAdmin, parsed.data);
  }

  @Get('customers/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  customer(@Param('id') id: string) { return this.admin.customer(id); }

  @Post('customers/:id/whatsapp-opt-out')
  @Roles('SUPER_ADMIN', 'ADMIN')
  optOut(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') customerId: string) { return this.whatsappCompliance.optOut(currentAdmin.id, customerId); }

  @Post('customers/:id/verifications')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createVerification(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') customerId: string, @Body() body: unknown) {
    const parsed = createVerificationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.createVerification(currentAdmin, customerId, parsed.data.addressId);
  }

  @Get('verifications')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  verifications(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.verifications(parsed.data);
  }

  @Get('verifications/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  verification(@Param('id') id: string) { return this.admin.verification(id); }

  @Post('verifications/:id/resend')
  @Roles('SUPER_ADMIN', 'ADMIN')
  resend(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) { return this.admin.resend(currentAdmin, id); }

  @Post('verifications/:id/revoke')
  @Roles('SUPER_ADMIN', 'ADMIN')
  revoke(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) { return this.admin.revoke(currentAdmin, id); }

  @Post('verifications/:id/reminders')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reminder(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) { return this.admin.sendManualReminder(currentAdmin, id); }

  @Post('verifications/:id/review')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER')
  async review(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string, @Body() body: unknown) {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.review(currentAdmin, id, parsed.data);
  }

  @Get('reminders')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  reminders(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.reminders(parsed.data);
  }

  @Get('audit-logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  auditLogs(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.audits(parsed.data);
  }

  @Get('settings/validation')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  settings() { return this.admin.settings(); }

  @Put('settings/validation')
  @Roles('SUPER_ADMIN')
  async updateSettings(@CurrentAdmin() currentAdmin: RequestAdmin, @Body() body: unknown) {
    const parsed = validationConfigSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.updateSettings(currentAdmin, parsed.data);
  }

  @Get('integrations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  integrations() { return this.admin.integrations(); }

  @Get('outbox')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  outbox(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.outbox(parsed.data);
  }
}
