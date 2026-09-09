import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const geographyPoint = customType<{
  data: { latitude: number; longitude: number };
  driverData: string;
  notNull: false;
}>({
  dataType: () => 'geography(point,4326)',
  toDriver: (value) => `SRID=4326;POINT(${value.longitude} ${value.latitude})`,
});

const id = () => uuid('id').defaultRandom().primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

// Better Auth tables. Customer records intentionally do not use these tables.
export const authUsers = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  role: varchar('role', { length: 32 }).default('VIEWER').notNull(),
  department: text('department'),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
});

export const authAccounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  issuer: text('issuer').notNull().default('local:credential'),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authVerifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customers = pgTable('customers', {
  id: id(),
  externalId: varchar('external_id', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  phoneE164: varchar('phone_e164', { length: 32 }).notNull(),
  whatsappOptInAt: timestamp('whatsapp_opt_in_at', { withTimezone: true }),
  whatsappOptInSource: varchar('whatsapp_opt_in_source', { length: 128 }),
  whatsappOptOutAt: timestamp('whatsapp_opt_out_at', { withTimezone: true }),
  status: varchar('status', { length: 48 }).notNull().default('ACTIVE'),
  sourceRecordId: varchar('source_record_id', { length: 128 }).unique(),
  sourceCreatedAt: timestamp('source_created_at', { withTimezone: true }),
  isCoverBts: boolean('is_cover_bts'),
  btsName: varchar('bts_name', { length: 255 }),
  coverageStatus: varchar('coverage_status', { length: 64 }),
  sourceMetadata: jsonb('source_metadata'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const administrativeRegions = pgTable('administrative_regions', {
  code: varchar('code', { length: 13 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  parentCode: varchar('parent_code', { length: 13 }),
  level: integer('level').notNull(),
});

export const regionPostalCodes = pgTable('region_postal_codes', {
  regionCode: varchar('region_code', { length: 13 }).primaryKey(),
  postalCode: varchar('postal_code', { length: 5 }),
});

export const customerAddresses = pgTable('customer_addresses', {
  id: id(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  addressType: varchar('address_type', { length: 32 }).notNull(),
  addressStatus: varchar('address_status', { length: 32 }).notNull(),
  rawAddress: text('raw_address').notNull(),
  addressReference: text('address_reference'),
  province: varchar('province', { length: 128 }).notNull(),
  city: varchar('city', { length: 128 }).notNull(),
  district: varchar('district', { length: 128 }).notNull(),
  subdistrict: varchar('subdistrict', { length: 128 }).notNull(),
  postalCode: varchar('postal_code', { length: 16 }).notNull(),
  street: varchar('street', { length: 255 }).notNull(),
  houseNumber: varchar('house_number', { length: 64 }).notNull(),
  rt: varchar('rt', { length: 8 }),
  rw: varchar('rw', { length: 8 }),
  building: text('building'),
  block: varchar('block', { length: 64 }),
  unit: varchar('unit', { length: 64 }),
  addressDetail: text('address_detail'),
  landmark: text('landmark'),
  referenceLocation: geographyPoint('reference_location'),
  referenceSource: varchar('reference_source', { length: 48 }).notNull(),
  referencePrecision: varchar('reference_precision', { length: 32 }).notNull(),
  referenceConfidence: numeric('reference_confidence', { precision: 4, scale: 3 }).notNull(),
  geocodingProvider: varchar('geocoding_provider', { length: 128 }),
  providerPlaceId: varchar('provider_place_id', { length: 255 }),
  geocodedAt: timestamp('geocoded_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  isVerified: boolean('is_verified').notNull().default(false),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verificationCampaigns = pgTable('verification_campaigns', {
  id: id(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Jakarta'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  targetCount: integer('target_count').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  optedOutCount: integer('opted_out_count').notNull().default(0),
  targetFilter: jsonb('target_filter'),
  batchSize: integer('batch_size').notNull().default(1000),
  dailySendLimit: integer('daily_send_limit').notNull().default(500),
  sendWindowDays: integer('send_window_days').notNull().default(7),
  materializationCursor: text('materialization_cursor'),
  materializationComplete: boolean('materialization_complete').notNull().default(true),
  materializedCount: integer('materialized_count').notNull().default(0),
  createdBy: text('created_by')
    .notNull()
    .references(() => authUsers.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verificationSessions = pgTable('verification_sessions', {
  id: id(),
  campaignId: uuid('campaign_id').references(() => verificationCampaigns.id),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  currentAddressId: uuid('current_address_id')
    .notNull()
    .references(() => customerAddresses.id),
  tokenId: varchar('token_id', { length: 64 }).unique(),
  tokenHash: varchar('token_hash', { length: 128 }).unique(),
  verificationMode: varchar('verification_mode', { length: 16 }).notNull().default('LIVE'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  verificationStatus: varchar('verification_status', { length: 48 }).notNull().default('CREATED'),
  customerConfirmationStatus: varchar('customer_confirmation_status', { length: 32 }).notNull().default('UNCONFIRMED'),
  attemptCount: integer('attempt_count').notNull().default(0),
  reminderCount: integer('reminder_count').notNull().default(0),
  registeredPhoneSnapshot: varchar('registered_phone_snapshot', { length: 32 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true }),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  locationVerifiedAt: timestamp('location_verified_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locationCaptures = pgTable('location_captures', {
  id: id(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => verificationSessions.id),
  location: geographyPoint('location').notNull(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  accuracyMeters: numeric('accuracy_meters', { precision: 10, scale: 2 }).notNull(),
  sampleCount: integer('sample_count').notNull(),
  bestAccuracyMeters: numeric('best_accuracy_meters', { precision: 10, scale: 2 }).notNull(),
  samples: jsonb('samples').notNull(),
  deviceTimestamp: timestamp('device_timestamp', { withTimezone: true }).notNull(),
  serverTimestamp: timestamp('server_timestamp', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
});

export const validationResults = pgTable('validation_results', {
  id: id(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => verificationSessions.id),
  captureId: uuid('capture_id')
    .notNull()
    .references(() => locationCaptures.id),
  addressId: uuid('address_id')
    .notNull()
    .references(() => customerAddresses.id),
  provinceMatch: boolean('province_match').notNull(),
  cityMatch: boolean('city_match').notNull(),
  districtMatch: boolean('district_match').notNull(),
  subdistrictMatch: boolean('subdistrict_match').notNull(),
  streetScore: numeric('street_score', { precision: 4, scale: 3 }).notNull(),
  houseNumberMatch: boolean('house_number_match'),
  gpsAccuracyMeters: numeric('gps_accuracy_meters', { precision: 10, scale: 2 }).notNull(),
  distanceToReferenceMeters: numeric('distance_to_reference_meters', { precision: 12, scale: 2 }),
  addressScore: numeric('address_score', { precision: 4, scale: 3 }).notNull(),
  result: varchar('result', { length: 64 }).notNull(),
  reasonCodes: jsonb('reason_codes').notNull(),
  reverseGeocode: jsonb('reverse_geocode').notNull(),
  referencePrecision: varchar('reference_precision', { length: 32 }).notNull(),
  engineVersion: varchar('engine_version', { length: 32 }).notNull(),
  configVersion: varchar('config_version', { length: 64 }).notNull(),
  capturedLatitude: numeric('captured_latitude', { precision: 10, scale: 7 }).notNull(),
  capturedLongitude: numeric('captured_longitude', { precision: 10, scale: 7 }).notNull(),
  referenceLatitude: numeric('reference_latitude', { precision: 10, scale: 7 }),
  referenceLongitude: numeric('reference_longitude', { precision: 10, scale: 7 }),
  createdAt: createdAt(),
});

export const verificationReviews = pgTable('verification_reviews', {
  id: id(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => verificationSessions.id),
  reviewerUserId: text('reviewer_user_id')
    .notNull()
    .references(() => authUsers.id),
  decision: varchar('decision', { length: 48 }).notNull(),
  reasonCode: varchar('reason_code', { length: 128 }).notNull(),
  reviewNote: text('review_note').notNull(),
  engineResultSnapshot: jsonb('engine_result_snapshot'),
  beforeStatus: varchar('before_status', { length: 48 }).notNull(),
  afterStatus: varchar('after_status', { length: 48 }).notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const reminders = pgTable('reminders', {
  id: id(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => verificationSessions.id),
  reminderNumber: integer('reminder_number').notNull(),
  channel: varchar('channel', { length: 32 }).notNull().default('WHATSAPP'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  tokenId: varchar('token_id', { length: 64 }).unique(),
  tokenHash: varchar('token_hash', { length: 128 }).unique(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  tokenInvalidatedAt: timestamp('token_invalidated_at', { withTimezone: true }),
  status: varchar('status', { length: 32 }).notNull(),
  messageText: text('message_text').notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: createdAt(),
});

export const verificationCampaignItems = pgTable('verification_campaign_items', {
  id: id(),
  campaignId: uuid('campaign_id')
    .notNull()
    .references(() => verificationCampaigns.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  addressId: uuid('address_id')
    .notNull()
    .references(() => customerAddresses.id),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => verificationSessions.id),
  status: varchar('status', { length: 32 }).notNull().default('PENDING'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const whatsappDeliveryLogs = pgTable('whatsapp_delivery_logs', {
  id: id(),
  phoneHash: varchar('phone_hash', { length: 64 }).notNull(),
  messageType: varchar('message_type', { length: 32 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  status: varchar('status', { length: 32 }).notNull().default('ACCEPTED'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const integrationOutbox = pgTable('integration_outbox', {
  id: id(),
  eventId: uuid('event_id').defaultRandom().notNull().unique(),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  aggregateType: varchar('aggregate_type', { length: 64 }).notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  correlationId: varchar('correlation_id', { length: 128 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('PENDING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const integrationConfigs = pgTable('integration_configs', {
  id: id(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  name: text('name').notNull(),
  description: text('description').notNull(),
  status: varchar('status', { length: 64 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const validationConfigs = pgTable('validation_configs', {
  id: id(),
  configVersion: varchar('config_version', { length: 64 }).notNull(),
  configValues: jsonb('config_values').notNull(),
  updatedBy: text('updated_by').references(() => authUsers.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  actorUserId: text('actor_user_id').notNull(),
  actorName: text('actor_name').notNull(),
  action: varchar('action', { length: 128 }).notNull(),
  entityType: varchar('entity_type', { length: 64 }).notNull(),
  entityId: text('entity_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

export const importJobs = pgTable('import_jobs', {
  id: id(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('QUEUED'),
  rowsRead: integer('rows_read').notNull().default(0),
  rowsProcessed: integer('rows_processed').notNull().default(0),
  rowsFailed: integer('rows_failed').notNull().default(0),
  customersUpserted: integer('customers_upserted').notNull().default(0),
  addressesInserted: integer('addresses_inserted').notNull().default(0),
  addressesUpdated: integer('addresses_updated').notNull().default(0),
  errorSummary: text('error_summary'),
  createdBy: text('created_by')
    .notNull()
    .references(() => authUsers.id),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const customerRelations = relations(customers, ({ many }) => ({
  addresses: many(customerAddresses),
  sessions: many(verificationSessions),
}));

export const addressRelations = relations(customerAddresses, ({ one, many }) => ({
  customer: one(customers, { fields: [customerAddresses.customerId], references: [customers.id] }),
  sessions: many(verificationSessions),
  validationResults: many(validationResults),
}));

export const verificationRelations = relations(verificationSessions, ({ one, many }) => ({
  campaign: one(verificationCampaigns, {
    fields: [verificationSessions.campaignId],
    references: [verificationCampaigns.id],
  }),
  customer: one(customers, { fields: [verificationSessions.customerId], references: [customers.id] }),
  address: one(customerAddresses, {
    fields: [verificationSessions.currentAddressId],
    references: [customerAddresses.id],
  }),
  captures: many(locationCaptures),
  results: many(validationResults),
  reviews: many(verificationReviews),
  reminders: many(reminders),
}));

export const campaignRelations = relations(verificationCampaigns, ({ one, many }) => ({
  creator: one(authUsers, { fields: [verificationCampaigns.createdBy], references: [authUsers.id] }),
  sessions: many(verificationSessions),
  items: many(verificationCampaignItems),
}));

export const campaignItemRelations = relations(verificationCampaignItems, ({ one }) => ({
  campaign: one(verificationCampaigns, {
    fields: [verificationCampaignItems.campaignId],
    references: [verificationCampaigns.id],
  }),
  customer: one(customers, { fields: [verificationCampaignItems.customerId], references: [customers.id] }),
  address: one(customerAddresses, {
    fields: [verificationCampaignItems.addressId],
    references: [customerAddresses.id],
  }),
  session: one(verificationSessions, {
    fields: [verificationCampaignItems.sessionId],
    references: [verificationSessions.id],
  }),
}));

export const authUserRelations = relations(authUsers, ({ many }) => ({
  sessions: many(authSessions),
  accounts: many(authAccounts),
  reviews: many(verificationReviews),
}));

export const spatialPointSql = (latitude: number, longitude: number) =>
  sql`ST_SetSRID(ST_Point(${longitude}, ${latitude}), 4326)::geography`;
