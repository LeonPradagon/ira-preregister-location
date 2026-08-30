import { z } from 'zod';

export const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().positive(),
  capturedAt: z.string().datetime(),
});

export const locationSamplesSchema = z.object({
  samples: z.array(coordinateSchema).min(3).max(5),
});

export const confirmationSchema = z.object({ confirmed: z.boolean() });

export const reminderSchema = z.object({
  reminderPreference: z.enum(['IN_1_HOUR', 'TONIGHT', 'TOMORROW_MORNING', 'DEFAULT']),
});

export const addressChangeSchema = z.object({
  province: z.string().trim().min(1).max(128),
  city: z.string().trim().min(1).max(128),
  district: z.string().trim().min(1).max(128),
  subdistrict: z.string().trim().min(1).max(128),
  postalCode: z.string().trim().min(3).max(16),
  street: z.string().trim().min(1).max(255),
  houseNumber: z.string().trim().min(1).max(64),
  rt: z.string().trim().max(8).optional(),
  rw: z.string().trim().max(8).optional(),
  building: z.string().trim().max(255).optional(),
  block: z.string().trim().max(64).optional(),
  unit: z.string().trim().max(64).optional(),
  addressDetail: z.string().trim().max(1000).optional(),
  landmark: z.string().trim().max(1000).optional(),
});

export const customerCreateSchema = z.object({
  externalId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(2).max(255),
  phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phoneE164 must use E.164 format'),
  status: z.enum(['ACTIVE', 'PENDING_INSTALLATION', 'SUSPENDED', 'VERIFIED']).default('ACTIVE'),
  address: addressChangeSchema.extend({
    referenceLocation: z.object({
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
    }),
    referenceSource: z.enum(['MASTER_COORDINATE', 'GEOCODED', 'CUSTOMER_PROPOSED']).default('MASTER_COORDINATE'),
    referencePrecision: z.enum(['EXACT_MASTER', 'ROOFTOP', 'HOUSE', 'STREET', 'AREA', 'DISTRICT', 'CITY']).default('EXACT_MASTER'),
    referenceConfidence: z.number().finite().min(0).max(1).default(1),
  }),
});

export const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_RETRY', 'REQUEST_ADDRESS_UPDATE']),
  reasonCode: z.string().trim().min(1).max(128),
  reviewNote: z.string().trim().min(1).max(5000),
});

export const validationConfigSchema = z.object({
  GPS_MAX_ACCURACY_METERS: z.number().positive().optional(),
  HOME_RADIUS_METERS: z.number().positive().optional(),
  STREET_MATCH_THRESHOLD: z.number().min(0).max(1).optional(),
  ADDRESS_SCORE_THRESHOLD: z.number().min(0).max(1).optional(),
  MAX_LOCATION_ATTEMPTS: z.number().int().positive().optional(),
  MAX_REMINDERS_PER_SESSION: z.number().int().min(1).max(3).optional(),
  COORDINATE_DISPLAY_DECIMALS: z.number().int().min(0).max(8).optional(),
  VERIFICATION_TOKEN_TTL_DAYS: z.number().int().positive().optional(),
  REMINDER_DEFAULT_1_HOURS: z.number().positive().optional(),
  REMINDER_DEFAULT_2_HOURS: z.number().positive().optional(),
  REMINDER_DEFAULT_3_HOURS: z.number().positive().optional(),
  ENABLE_CUSTOMER_OTP: z.boolean().optional(),
  ENABLE_IRA_COVERAGE: z.boolean().optional(),
  ENABLE_TICKETING: z.boolean().optional(),
  ENABLE_MANUAL_REVIEW: z.boolean().optional(),
  ENABLE_ADDRESS_EDIT: z.boolean().optional(),
  ENABLE_REMINDERS: z.boolean().optional(),
});

export type GpsSample = z.infer<typeof coordinateSchema>;
export type AddressChangeInput = z.infer<typeof addressChangeSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ValidationConfigInput = z.infer<typeof validationConfigSchema>;

export interface PublicVerificationContext {
  session: {
    id: string;
    status: string;
    expiresAt: string;
    customerConfirmationStatus: string;
    reminderCount: number;
  };
  customer: { id: string; name: string; phoneE164: string };
  address: Record<string, unknown>;
}
