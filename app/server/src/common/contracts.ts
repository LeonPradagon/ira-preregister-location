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

export const reminderSchema = z
  .object({
    reminderPreference: z.enum(['IN_1_HOUR', 'TONIGHT', 'TOMORROW_MORNING', 'DEFAULT']).optional(),
    scheduledAt: z.string().datetime().optional(),
    reminderUntilAt: z.string().datetime().optional(),
  })
  .refine((input) => Boolean(input.reminderPreference) !== Boolean(input.scheduledAt), {
    message: 'Provide either reminderPreference or scheduledAt',
    path: ['scheduledAt'],
  });

export const addressStatusSchema = z.object({ sameAddress: z.boolean() });

const unsafeAddressCharacterPattern = /[\u0000-\u001F\u007F-\u009F<>]/;
const addressTextSchema = (max: number) =>
  z.string().trim().max(max).refine((value) => !unsafeAddressCharacterPattern.test(value), {
    message: 'Alamat mengandung karakter yang tidak diizinkan',
  });
const requiredAddressTextSchema = (max: number) => addressTextSchema(max).min(1);

export const campaignTargetFilterSchema = z.object({
  locationStatus: z.enum(['UNVERIFIED', 'VERIFIED']).default('UNVERIFIED'),
  status: z.enum(['ACTIVE', 'PENDING_INSTALLATION', 'SUSPENDED', 'VERIFIED']).optional(),
  search: z.string().trim().max(128).default(''),
});

export const campaignCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    customerIds: z
      .array(z.string().uuid())
      .min(1)
      .max(10000)
      .transform((ids) => [...new Set(ids)])
      .optional(),
    targetFilter: campaignTargetFilterSchema.optional(),
    batchSize: z.coerce.number().int().min(1).max(1000).optional(),
    dailySendLimit: z.coerce.number().int().min(1).max(10000).optional(),
    sendWindowDays: z.coerce.number().int().min(0).max(30).optional(),
    scheduledAt: z.string().datetime().optional(),
    timezone: z.string().trim().min(1).max(64).default('Asia/Jakarta'),
  })
  .refine((input) => Boolean(input.customerIds?.length) !== Boolean(input.targetFilter), {
    message: 'Provide either customerIds or targetFilter',
    path: ['customerIds'],
  });

export const addressChangeSchema = z.object({
  province: requiredAddressTextSchema(128),
  city: requiredAddressTextSchema(128),
  district: requiredAddressTextSchema(128),
  subdistrict: requiredAddressTextSchema(128),
  postalCode: addressTextSchema(5)
    .refine((value) => !value || /^\d{5}$/.test(value), 'Kode pos harus terdiri dari 5 digit')
    .default(''),
  street: requiredAddressTextSchema(255),
  houseNumber: addressTextSchema(64)
    .max(64)
    .refine(
      (value) =>
        !value || !['unknown', 'tidak diketahui', 'tanpa nomor', 'n/a', 'na', '-', '00000'].includes(value.toLowerCase()),
      'Nomor rumah harus berupa nomor yang valid jika diisi',
    )
    .default(''),
  rt: addressTextSchema(8).optional(),
  rw: addressTextSchema(8).optional(),
  building: addressTextSchema(255).optional(),
  block: addressTextSchema(64).optional(),
  unit: addressTextSchema(64).optional(),
  addressDetail: addressTextSchema(1000).optional(),
  landmark: addressTextSchema(1000).optional(),
});

export const addressLookupSchema = addressChangeSchema.extend({
  postalCode: addressTextSchema(16).optional(),
  street: addressTextSchema(255).optional(),
  houseNumber: addressTextSchema(64).optional(),
});

export const customerCreateSchema = z.object({
  externalId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(2).max(255),
  phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/, 'phoneE164 must use E.164 format'),
  whatsappOptInAt: z.string().datetime().optional(),
  whatsappOptInSource: z.string().trim().min(1).max(128).optional(),
  status: z.enum(['ACTIVE', 'PENDING_INSTALLATION', 'SUSPENDED', 'VERIFIED']).default('ACTIVE'),
  address: addressChangeSchema
    .extend({
      referenceLocation: z
        .object({
          latitude: z.number().finite().min(-90).max(90),
          longitude: z.number().finite().min(-180).max(180),
        })
        .optional(),
      referenceSource: z.enum(['MASTER_COORDINATE', 'GEOCODED', 'CUSTOMER_PROPOSED']).optional(),
      referencePrecision: z
        .enum(['EXACT_MASTER', 'ROOFTOP', 'HOUSE', 'STREET', 'AREA', 'DISTRICT', 'CITY', 'UNKNOWN'])
        .optional(),
      referenceConfidence: z.number().finite().min(0).max(1).optional(),
    })
    .superRefine((input, context) => {
      // Coordinates are optional, but a partially filled pair is ambiguous and
      // must not silently be stored as a valid reference.
      if (
        input.referenceLocation &&
        (input.referenceLocation.latitude == null || input.referenceLocation.longitude == null)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['referenceLocation'],
          message: 'Latitude dan longitude harus diisi bersamaan',
        });
      }
    })
    .transform((input) => ({
      ...input,
      referenceSource: input.referenceSource ?? (input.referenceLocation ? 'MASTER_COORDINATE' : 'CUSTOMER_PROPOSED'),
      referencePrecision: input.referencePrecision ?? (input.referenceLocation ? 'EXACT_MASTER' : 'UNKNOWN'),
      referenceConfidence: input.referenceConfidence ?? (input.referenceLocation ? 1 : 0),
    })),
});

export const whatsappPreviewSchema = z
  .object({
    customerName: z.string().trim().min(1).max(255),
    phoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/),
    address: z.string().trim().max(1000).optional(),
    referenceLatitude: z.number().finite().min(-90).max(90).optional(),
    referenceLongitude: z.number().finite().min(-180).max(180).optional(),
    referencePrecision: z.enum(['EXACT_MASTER', 'ROOFTOP', 'HOUSE', 'STREET', 'AREA', 'DISTRICT', 'CITY']).optional(),
  })
  .refine((input) => (input.referenceLatitude == null) === (input.referenceLongitude == null), {
    message: 'referenceLatitude and referenceLongitude must be provided together',
    path: ['referenceLatitude'],
  });

export const customerUpdateSchema = z.object({
  externalId: z.string().trim().min(1).max(128).optional(),
  name: z.string().trim().min(2).max(255).optional(),
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'phoneE164 must use E.164 format')
    .optional(),
  whatsappOptInAt: z.string().datetime().nullable().optional(),
  whatsappOptInSource: z.string().trim().min(1).max(128).nullable().optional(),
  status: z.enum(['ACTIVE', 'PENDING_INSTALLATION', 'SUSPENDED', 'VERIFIED']).optional(),
  address: customerCreateSchema.shape.address.optional(),
});

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(128).default(''),
  status: z.enum(['ACTIVE', 'PENDING_INSTALLATION', 'SUSPENDED', 'VERIFIED']).optional(),
  locationStatus: z.enum(['UNVERIFIED', 'VERIFIED']).optional(),
  addressCompleteness: z.enum(['COMPLETE', 'INCOMPLETE']).optional(),
  campaignAvailable: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  cursor: z.string().max(255).optional(),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(128).default(''),
  status: z.string().trim().max(64).optional(),
  actor: z.enum(['CUSTOMER', 'SYSTEM', 'ADMIN']).optional(),
  cursor: z.string().max(255).optional(),
});

export const whatsappDeliveryStatusSchema = z.object({
  providerMessageId: z.string().trim().min(1).max(255),
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']),
  error: z.string().trim().max(500).optional(),
  occurredAt: z.string().datetime().optional(),
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
  STREET_SOFT_MATCH_THRESHOLD: z.number().min(0).max(1).optional(),
  ADDRESS_SCORE_THRESHOLD: z.number().min(0).max(1).optional(),
  AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD: z.number().min(0.9).max(1).optional(),
  MAX_LOCATION_ATTEMPTS: z.number().int().min(1).max(3).optional(),
  MAX_REMINDERS_PER_SESSION: z.number().int().min(1).max(3).optional(),
  COORDINATE_DISPLAY_DECIMALS: z.number().int().min(0).max(8).optional(),
  VERIFICATION_TOKEN_TTL_DAYS: z.number().int().positive().optional(),
  REMINDER_LINK_TTL_HOURS: z.number().positive().optional(),
  REMINDER_DEFAULT_1_HOURS: z.number().positive().optional(),
  REMINDER_DEFAULT_2_HOURS: z.number().positive().optional(),
  REMINDER_DEFAULT_3_HOURS: z.number().positive().optional(),
  WHATSAPP_DAILY_SEND_LIMIT: z.number().int().min(1).max(10000).optional(),
  WHATSAPP_RATE_LIMIT_PER_SECOND: z.number().int().positive().optional(),
  WHATSAPP_MIN_INTERVAL_MINUTES: z.number().int().positive().optional(),
  ENABLE_CUSTOMER_OTP: z.boolean().optional(),
  ENABLE_IRA_COVERAGE: z.boolean().optional(),
  ENABLE_TICKETING: z.boolean().optional(),
  ENABLE_MANUAL_REVIEW: z.boolean().optional(),
  ENABLE_AUTO_APPROVAL: z.boolean().optional(),
  ENABLE_ADDRESS_EDIT: z.boolean().optional(),
  ENABLE_REMINDERS: z.boolean().optional(),
});

export const adminUserCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER']).default('VIEWER'),
  department: z.string().trim().max(128).optional(),
});

export const adminUserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'REVIEWER', 'VIEWER']).optional(),
  department: z.string().trim().max(128).nullable().optional(),
});

export const adminUserPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export type GpsSample = z.infer<typeof coordinateSchema>;
export type AddressChangeInput = z.infer<typeof addressChangeSchema>;
export type AddressLookupInput = z.infer<typeof addressLookupSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerListQueryInput = z.infer<typeof customerListQuerySchema>;
export type AdminListQueryInput = z.infer<typeof adminListQuerySchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ValidationConfigInput = z.infer<typeof validationConfigSchema>;
export type AddressStatusInput = z.infer<typeof addressStatusSchema>;
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
export type CampaignTargetFilterInput = z.infer<typeof campaignTargetFilterSchema>;
export type WhatsAppPreviewInput = z.infer<typeof whatsappPreviewSchema>;
export type WhatsAppDeliveryStatusInput = z.infer<typeof whatsappDeliveryStatusSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminUserPasswordInput = z.infer<typeof adminUserPasswordSchema>;

export interface PublicVerificationContext {
  session: {
    id: string;
    status: string;
    expiresAt: string;
    linkExpiresAt: string;
    customerConfirmationStatus: string;
    reminderCount: number;
    attemptCount: number;
    isReminderLink: boolean;
    canScheduleReminder: boolean;
  };
  customer: { id: string; name: string; phoneE164: string };
  address: Record<string, unknown>;
}
