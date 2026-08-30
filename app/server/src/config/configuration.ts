import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => value === 'true' || value === true, z.boolean());
const optionalString = z.preprocess((value) => value === '' ? undefined : value, z.string().optional());
const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  GPS_MAX_ACCURACY_METERS: z.coerce.number().positive().default(30),
  HOME_RADIUS_METERS: z.coerce.number().positive().default(50),
  MAX_LOCATION_ATTEMPTS: z.coerce.number().int().positive().default(5),
  MAX_REMINDERS_PER_SESSION: z.coerce.number().int().min(1).max(3).default(3),
  COORDINATE_DISPLAY_DECIMALS: z.coerce.number().int().min(0).max(8).default(6),
  VERIFICATION_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  REMINDER_DEFAULT_1_HOURS: z.coerce.number().positive().default(2),
  REMINDER_DEFAULT_2_HOURS: z.coerce.number().positive().default(24),
  REMINDER_DEFAULT_3_HOURS: z.coerce.number().positive().default(24),
  ADDRESS_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  STREET_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.9),
  ENABLE_CUSTOMER_OTP: booleanFromEnv.default(false),
  ENABLE_IRA_COVERAGE: booleanFromEnv.default(false),
  ENABLE_TICKETING: booleanFromEnv.default(false),
  ENABLE_MANUAL_REVIEW: booleanFromEnv.default(true),
  ENABLE_ADDRESS_EDIT: booleanFromEnv.default(true),
  ENABLE_REMINDERS: booleanFromEnv.default(true),
  GEOCODING_BASE_URL: optionalUrl,
  GEOCODING_API_KEY: optionalString,
  GEOCODING_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  GEOCODING_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  WHATSAPP_BASE_URL: optionalUrl,
  WHATSAPP_API_KEY: optionalString,
  WHATSAPP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
