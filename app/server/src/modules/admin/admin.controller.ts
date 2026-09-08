import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import {
  adminListQuerySchema,
  adminUserCreateSchema,
  adminUserPasswordSchema,
  adminUserUpdateSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
  reviewSchema,
  validationConfigSchema,
} from '../../common/contracts.js';
import { CurrentAdmin, RequestAdmin } from '../../common/request-user.js';
import { BetterAuthGuard } from '../../auth/auth.guard.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { Roles } from '../../common/roles.js';
import { AdminService } from './admin.service.js';
import { z } from 'zod';
import { WhatsAppComplianceService } from '../../integrations/whatsapp/whatsapp-compliance.service.js';
import { CustomerImportService } from '../imports/customer-import.service.js';
import type { UploadedCustomerFile } from '../imports/customer-import.service.js';

const CustomerFileInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: tmpdir(),
    filename: (_request, file, callback) =>
      callback(
        null,
        `ira_preregist-upload-${randomUUID()}${file.originalname.slice(file.originalname.lastIndexOf('.'))}`,
      ),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const createVerificationSchema = z.object({ addressId: z.string().uuid() });

@Controller('admin')
@UseGuards(BetterAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly whatsappCompliance: WhatsAppComplianceService,
    private readonly customerImport: CustomerImportService,
  ) {}

  @Get('me')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  me(@CurrentAdmin() currentAdmin: RequestAdmin) {
    return this.admin.me(currentAdmin);
  }

  @Get('users')
  @Roles('SUPER_ADMIN')
  users(@Query('search') search?: string) {
    return this.admin.listUsers({ search });
  }

  @Post('users')
  @Roles('SUPER_ADMIN')
  createUser(@CurrentAdmin() currentAdmin: RequestAdmin, @Body() body: unknown) {
    const parsed = adminUserCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.createUser(currentAdmin, parsed.data);
  }

  @Put('users/:id')
  @Roles('SUPER_ADMIN')
  updateUser(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string, @Body() body: unknown) {
    const parsed = adminUserUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.updateUser(currentAdmin, id, parsed.data);
  }

  @Post('users/:id/password')
  @Roles('SUPER_ADMIN')
  resetUserPassword(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string, @Body() body: unknown) {
    const parsed = adminUserPasswordSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.resetUserPassword(currentAdmin, id, parsed.data);
  }

  @Post('users/:id/disable')
  @Roles('SUPER_ADMIN')
  disableUser(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.setUserDisabled(currentAdmin, id, true);
  }

  @Post('users/:id/enable')
  @Roles('SUPER_ADMIN')
  enableUser(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.setUserDisabled(currentAdmin, id, false);
  }

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('customers')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  customers(@Query() query: unknown) {
    const parsed = customerListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.listCustomers(parsed.data);
  }

  @Post('customers/import')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UseInterceptors(CustomerFileInterceptor)
  async importCustomers(
    @CurrentAdmin() currentAdmin: RequestAdmin,
    @UploadedFile() file: UploadedCustomerFile,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!file) throw new BadRequestException('Pilih file .xlsx atau .csv terlebih dahulu.');
    const result = await this.customerImport.importLegacy(currentAdmin, file);
    response.status(result && 'jobId' in result ? 202 : 200);
    return result;
  }

  @Get('import-jobs/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  importJob(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.customerImport.get(currentAdmin, id);
  }

  @Post('import-jobs')
  @HttpCode(202)
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UseInterceptors(CustomerFileInterceptor)
  createImportJob(@CurrentAdmin() currentAdmin: RequestAdmin, @UploadedFile() file: UploadedCustomerFile) {
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
  customer(@Param('id') id: string) {
    return this.admin.customer(id);
  }

  @Put('customers/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async updateCustomer(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string, @Body() body: unknown) {
    const parsed = customerUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.updateCustomer(currentAdmin, id, parsed.data);
  }

  @Delete('customers/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteCustomer(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.deleteCustomer(currentAdmin, id);
  }

  @Post('customers/:id/whatsapp-opt-out')
  @Roles('SUPER_ADMIN', 'ADMIN')
  optOut(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') customerId: string) {
    return this.whatsappCompliance.optOut(currentAdmin.id, customerId);
  }

  @Post('customers/:id/verifications')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createVerification(
    @CurrentAdmin() currentAdmin: RequestAdmin,
    @Param('id') customerId: string,
    @Body() body: unknown,
  ) {
    const parsed = createVerificationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.createVerification(currentAdmin, customerId, parsed.data.addressId);
  }

  @Post('customers/:id/verifications/simulation')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async createSimulationVerification(
    @CurrentAdmin() currentAdmin: RequestAdmin,
    @Param('id') customerId: string,
    @Body() body: unknown,
  ) {
    const parsed = createVerificationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.createSimulationVerification(currentAdmin, customerId, parsed.data.addressId);
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
  verification(@Param('id') id: string) {
    return this.admin.verification(id);
  }

  @Post('verifications/:id/address-from-gps')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER')
  addressFromGps(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.updateAddressFromGps(currentAdmin, id);
  }

  @Post('verifications/:id/resend')
  @Roles('SUPER_ADMIN', 'ADMIN')
  resend(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.resend(currentAdmin, id);
  }

  @Post('verifications/:id/revoke')
  @Roles('SUPER_ADMIN', 'ADMIN')
  revoke(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.revoke(currentAdmin, id);
  }

  @Post('verifications/:id/reminders')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reminder(@CurrentAdmin() currentAdmin: RequestAdmin, @Param('id') id: string) {
    return this.admin.sendManualReminder(currentAdmin, id);
  }

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
  settings() {
    return this.admin.settings();
  }

  @Put('settings/validation')
  @Roles('SUPER_ADMIN')
  async updateSettings(@CurrentAdmin() currentAdmin: RequestAdmin, @Body() body: unknown) {
    const parsed = validationConfigSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.updateSettings(currentAdmin, parsed.data);
  }

  @Get('integrations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  integrations() {
    return this.admin.integrations();
  }

  @Get('outbox')
  @Roles('SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER')
  outbox(@Query() query: unknown) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.admin.outbox(parsed.data);
  }
}
