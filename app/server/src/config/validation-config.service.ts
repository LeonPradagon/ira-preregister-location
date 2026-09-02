import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { validationConfigs } from '../db/schema/index.js';
import { ValidationConfigInput } from '../common/contracts.js';

export interface RuntimeValidationConfig extends Record<string, unknown> {
  GPS_MAX_ACCURACY_METERS: number;
  HOME_RADIUS_METERS: number;
  STREET_MATCH_THRESHOLD: number;
  ADDRESS_SCORE_THRESHOLD: number;
  MAX_LOCATION_ATTEMPTS: number;
  MAX_REMINDERS_PER_SESSION: number;
  COORDINATE_DISPLAY_DECIMALS: number;
  VERIFICATION_TOKEN_TTL_DAYS: number;
  REMINDER_LINK_TTL_HOURS: number;
  REMINDER_DEFAULT_1_HOURS: number;
  REMINDER_DEFAULT_2_HOURS: number;
  REMINDER_DEFAULT_3_HOURS: number;
  ENABLE_CUSTOMER_OTP: boolean;
  ENABLE_IRA_COVERAGE: boolean;
  ENABLE_TICKETING: boolean;
  ENABLE_MANUAL_REVIEW: boolean;
  ENABLE_ADDRESS_EDIT: boolean;
  ENABLE_REMINDERS: boolean;
}

@Injectable()
export class ValidationConfigService {
  private fromEnvironment(): RuntimeValidationConfig {
    return {
      GPS_MAX_ACCURACY_METERS: Number(process.env.GPS_MAX_ACCURACY_METERS ?? 30),
      HOME_RADIUS_METERS: Number(process.env.HOME_RADIUS_METERS ?? 50),
      STREET_MATCH_THRESHOLD: Number(process.env.STREET_MATCH_THRESHOLD ?? 0.9),
      ADDRESS_SCORE_THRESHOLD: Number(process.env.ADDRESS_SCORE_THRESHOLD ?? 0.9),
      MAX_LOCATION_ATTEMPTS: Number(process.env.MAX_LOCATION_ATTEMPTS ?? 5),
      MAX_REMINDERS_PER_SESSION: Number(process.env.MAX_REMINDERS_PER_SESSION ?? 3),
      COORDINATE_DISPLAY_DECIMALS: Number(process.env.COORDINATE_DISPLAY_DECIMALS ?? 6),
      VERIFICATION_TOKEN_TTL_DAYS: Number(process.env.VERIFICATION_TOKEN_TTL_DAYS ?? 7),
      REMINDER_LINK_TTL_HOURS: Number(process.env.REMINDER_LINK_TTL_HOURS ?? 24),
      REMINDER_DEFAULT_1_HOURS: Number(process.env.REMINDER_DEFAULT_1_HOURS ?? 2),
      REMINDER_DEFAULT_2_HOURS: Number(process.env.REMINDER_DEFAULT_2_HOURS ?? 24),
      REMINDER_DEFAULT_3_HOURS: Number(process.env.REMINDER_DEFAULT_3_HOURS ?? 24),
      ENABLE_CUSTOMER_OTP: process.env.ENABLE_CUSTOMER_OTP === 'true',
      ENABLE_IRA_COVERAGE: process.env.ENABLE_IRA_COVERAGE === 'true',
      ENABLE_TICKETING: process.env.ENABLE_TICKETING === 'true',
      ENABLE_MANUAL_REVIEW: process.env.ENABLE_MANUAL_REVIEW !== 'false',
      ENABLE_ADDRESS_EDIT: process.env.ENABLE_ADDRESS_EDIT !== 'false',
      ENABLE_REMINDERS: process.env.ENABLE_REMINDERS !== 'false',
    };
  }

  async get(): Promise<RuntimeValidationConfig> {
    const [latest] = await db.select().from(validationConfigs).orderBy(desc(validationConfigs.updatedAt)).limit(1);
    const persisted = latest?.configValues && typeof latest.configValues === 'object'
      ? latest.configValues as Partial<RuntimeValidationConfig>
      : {};
    return { ...this.fromEnvironment(), ...persisted };
  }

  async update(adminId: string, input: ValidationConfigInput): Promise<RuntimeValidationConfig> {
    const values = { ...(await this.get()), ...input };
    await db.insert(validationConfigs).values({
      configVersion: `config-${Date.now()}`,
      configValues: values,
      updatedBy: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return values;
  }
}
