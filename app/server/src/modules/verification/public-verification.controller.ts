import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  addressChangeSchema,
  addressLookupSchema,
  addressStatusSchema,
  confirmationSchema,
  locationSamplesSchema,
  reminderSchema,
} from '../../common/contracts.js';
import { VerificationService } from './verification.service.js';

@Controller('public/verifications')
export class PublicVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get(':token')
  context(@Param('token') token: string) {
    return this.verification.open(token);
  }

  @Get(':token/status')
  status(@Param('token') token: string) {
    return this.verification.open(token);
  }

  @Post(':token/customer-confirmation')
  async confirm(@Param('token') token: string, @Body() body: unknown) {
    const parsed = confirmationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.confirm(token, parsed.data.confirmed);
  }

  @Post(':token/consent')
  consent(@Param('token') token: string) {
    return this.verification.consent(token);
  }

  @Post(':token/location')
  async location(@Param('token') token: string, @Body() body: unknown) {
    const parsed = locationSamplesSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.submitLocation(token, parsed.data.samples);
  }

  @Post(':token/wait-for-home')
  async waitForHome(@Param('token') token: string, @Body() body: unknown) {
    const parsed = reminderSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.waitForHome(
      token,
      parsed.data.reminderPreference,
      parsed.data.scheduledAt,
      parsed.data.reminderUntilAt,
    );
  }

  @Post(':token/address-change')
  async addressChange(@Param('token') token: string, @Body() body: unknown) {
    const parsed = addressChangeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.changeAddress(token, parsed.data);
  }

  @Post(':token/address-lookup')
  async addressLookup(@Param('token') token: string, @Body() body: unknown) {
    const parsed = addressLookupSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.lookupAddress(token, parsed.data);
  }

  @Post(':token/address-status')
  async addressStatus(@Param('token') token: string, @Body() body: unknown) {
    const parsed = addressStatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.addressStatus(token, parsed.data.sameAddress);
  }

  @Post(':token/reminders')
  async reminder(@Param('token') token: string, @Body() body: unknown) {
    const parsed = reminderSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.verification.waitForHome(
      token,
      parsed.data.reminderPreference,
      parsed.data.scheduledAt,
      parsed.data.reminderUntilAt,
    );
  }
}
