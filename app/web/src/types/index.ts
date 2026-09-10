export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'REVIEWER' | 'VIEWER';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  department: string;
  avatarUrl?: string;
}

export type CustomerStatus = 'ACTIVE' | 'PENDING_INSTALLATION' | 'SUSPENDED' | 'VERIFIED';

export interface Customer {
  id: string;
  externalId: string;
  name: string;
  phoneE164: string;
  whatsappOptInAt?: string;
  whatsappOptInSource?: string;
  whatsappOptOutAt?: string;
  status: CustomerStatus;
  sourceRecordId?: string;
  sourceCreatedAt?: string;
  isCoverBts?: boolean;
  btsName?: string;
  coverageStatus?: string;
  sourceMetadata?: Record<string, unknown>;
  activeAddress?: CustomerAddress | null;
  latestVerification?: VerificationSession | null;
  createdAt: string;
  updatedAt: string;
}

export type AddressType = 'MASTER' | 'PROPOSED' | 'VERIFIED_INSTALLATION' | 'HISTORICAL';
export type AddressStatus = 'ACTIVE' | 'PROPOSED' | 'SUPERSEDED' | 'VERIFIED';
export type ReferenceSource = 'MASTER_COORDINATE' | 'GEOCODED' | 'CUSTOMER_PROPOSED' | 'PREREG_IMPORT';
export type ReferencePrecision =
  | 'EXACT_MASTER'
  | 'ROOFTOP'
  | 'HOUSE'
  | 'STREET'
  | 'AREA'
  | 'DISTRICT'
  | 'CITY'
  | 'UNKNOWN';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  addressType: AddressType;
  addressStatus: AddressStatus;
  rawAddress: string;
  addressReference?: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  rt?: string;
  rw?: string;
  building?: string;
  block?: string;
  unit?: string;
  addressDetail?: string;
  landmark?: string;
  referenceLocation: Coordinate | null;
  referenceSource: ReferenceSource;
  referencePrecision: ReferencePrecision;
  referenceConfidence: number; // 0.0 - 1.0
  geocodingProvider?: string;
  providerPlaceId?: string;
  isActive: boolean;
  isVerified: boolean;
  validFrom: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GpsSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
}

export interface LocationCapture {
  id: string;
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  sampleCount: number;
  bestAccuracyMeters: number;
  samples: GpsSample[];
  deviceTimestamp: string;
  serverTimestamp: string;
  userAgent?: string;
  createdAt: string;
}

export type LocationValidationResult =
  | 'LOCATION_VALID'
  | 'LOW_GPS_ACCURACY'
  | 'LOCATION_MISMATCH'
  | 'WAITING_FOR_HOME'
  | 'REFERENCE_LOCATION_NOT_PRECISE'
  | 'ADDRESS_CHANGE_PENDING_VERIFICATION'
  | 'CUSTOMER_DATA_MISMATCH'
  | 'MANUAL_REVIEW';

export interface ValidationResult {
  id: string;
  sessionId: string;
  captureId: string;
  addressId: string;
  provinceMatch: boolean;
  cityMatch: boolean;
  districtMatch: boolean;
  subdistrictMatch: boolean;
  streetScore: number; // 0.0 - 1.0
  houseNumberMatch?: boolean;
  gpsAccuracyM: number;
  distanceToReferenceM: number | null;
  addressScore: number; // 0.0 - 1.0
  reverseGeocode?: {
    province: string;
    city: string;
    district: string;
    subdistrict: string;
    street: string;
    houseNumber?: string;
    postalCode?: string;
    formattedAddress: string;
  };
  result: LocationValidationResult;
  reasonCodes: string[];
  referencePrecision: ReferencePrecision;
  engineVersion: string;
  configVersion: string;
  capturedLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: string;
    coordinateText: string;
    googleMapsUrl: string;
  };
  referenceLocation: {
    latitude: number;
    longitude: number;
    precision: ReferencePrecision;
  } | null;
  distanceFromReferenceMeters: number | null;
  createdAt: string;
}

export type VerificationStatus =
  | 'CREATED'
  | 'MESSAGE_SENT'
  | 'LINK_OPENED'
  | 'CUSTOMER_CONFIRMATION'
  | 'CONSENTED'
  | 'GPS_CAPTURING'
  | 'LOW_GPS_ACCURACY'
  | 'VALIDATING'
  | 'LOCATION_VALID'
  | 'LOCATION_MISMATCH'
  | 'WAITING_FOR_HOME'
  | 'REMINDER_SCHEDULED'
  | 'REMINDER_LIMIT_REACHED'
  | 'ADDRESS_EDITING'
  | 'ADDRESS_PROPOSED'
  | 'MANUAL_REVIEW'
  | 'CUSTOMER_DATA_MISMATCH'
  | 'COMPLETED'
  | 'EXPIRED';

export type CustomerConfirmationStatus = 'UNCONFIRMED' | 'CONFIRMED' | 'MISMATCH';

export interface VerificationSession {
  id: string;
  customerId: string;
  currentAddressId: string;
  expiresAt: string;
  linkExpiresAt?: string;
  revokedAt?: string;
  verificationStatus: VerificationStatus;
  customerConfirmationStatus: CustomerConfirmationStatus;
  attemptCount: number;
  reminderCount: number; // max 3
  registeredPhoneSnapshot: string;
  openedAt?: string;
  customerConfirmedAt?: string;
  consentAt?: string;
  locationVerifiedAt?: string;
  completedAt?: string;
  lastValidationResult?: ValidationResult;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPage {
  items: Customer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DashboardSummary {
  generatedAt: string;
  countAsOf?: string;
  customers: {
    total: number;
    active: number;
    verified: number;
    whatsappOptedIn: number;
    whatsappOptedOut: number;
  };
  verifications: {
    total: number;
    invitationsSent: number;
    linksOpened: number;
    customersConfirmed: number;
    customersMismatch: number;
    gpsCaptured: number;
    lowGpsAccuracy: number;
    waitingForHome: number;
    addressChanged: number;
    manualReview: number;
    locationValid: number;
    statusCounts: Record<string, number>;
  };
  reminders: {
    total: number;
    scheduled: number;
    sent: number;
    failed: number;
    cancelled: number;
    byNumber: Record<string, number>;
  };
  outbox: {
    total: number;
    pending: number;
    published: number;
    failed: number;
  };
}

export type CampaignStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
export type CampaignItemStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'OPTED_OUT';

export interface VerificationCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  timezone: string;
  scheduledAt: string;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  optedOutCount?: number;
  batchSize?: number;
  dailySendLimit?: number;
  sendWindowDays?: number;
  materializedCount?: number;
  materializationComplete?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewDecision = 'APPROVE' | 'REJECT' | 'REQUEST_RETRY' | 'REQUEST_ADDRESS_UPDATE';

export interface VerificationReview {
  id: string;
  sessionId: string;
  reviewerUserId: string;
  reviewerName: string;
  decision: ReviewDecision;
  reasonCode: string;
  reviewNote: string;
  engineResultSnapshot?: Record<string, unknown>;
  beforeStatus: VerificationStatus;
  afterStatus: VerificationStatus;
  reviewedAt: string;
  createdAt: string;
}

export type ReminderStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'LIMIT_REACHED';
export type ReminderPreference = 'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING' | 'DEFAULT';

export interface Reminder {
  id: string;
  sessionId: string;
  reminderNumber: number; // 1, 2, 3
  channel: 'WHATSAPP';
  scheduledAt: string;
  sentAt?: string;
  status: ReminderStatus;
  messageText: string;
  providerMessageId?: string;
  retryCount: number;
  createdAt: string;
}

export interface IntegrationOutboxEvent {
  id: string;
  eventId: string;
  eventType: 'location.verified.v1';
  aggregateType: 'VERIFICATION_SESSION';
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  payload: {
    eventId: string;
    eventType: string;
    occurredAt: string;
    correlationId: string;
    idempotencyKey: string;
    customer: {
      externalId: string;
      name?: string;
    };
    verifiedAddress: {
      addressId: string;
      fullAddress?: string;
    };
    verifiedLocation: {
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      verifiedAt: string;
    };
  };
  status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  attemptCount: number;
  nextRetryAt?: string;
  sentAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ValidationConfig {
  GPS_MAX_ACCURACY_METERS: number;
  HOME_RADIUS_METERS: number;
  STREET_MATCH_THRESHOLD: number;
  ADDRESS_SCORE_THRESHOLD: number;
  AUTO_APPROVAL_ADDRESS_SCORE_THRESHOLD: number;
  MAX_LOCATION_ATTEMPTS: number;
  MAX_REMINDERS_PER_SESSION: number;
  COORDINATE_DISPLAY_DECIMALS: number;
  VERIFICATION_TOKEN_TTL_DAYS: number;
  REMINDER_LINK_TTL_HOURS: number;
  REMINDER_DEFAULT_1_HOURS: number;
  REMINDER_DEFAULT_2_HOURS: number;
  REMINDER_DEFAULT_3_HOURS: number;
  WHATSAPP_DAILY_SEND_LIMIT: number;
  WHATSAPP_RATE_LIMIT_PER_SECOND: number;
  WHATSAPP_MIN_INTERVAL_MINUTES: number;
  ENABLE_CUSTOMER_OTP: boolean;
  ENABLE_IRA_COVERAGE: boolean;
  ENABLE_TICKETING: boolean;
  ENABLE_MANUAL_REVIEW: boolean;
  ENABLE_AUTO_APPROVAL: boolean;
  ENABLE_ADDRESS_EDIT: boolean;
  ENABLE_REMINDERS: boolean;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  timestamp: string;
}

export type AuditLogEntry = AuditLog;

export interface IntegrationConfigs {
  IRA_COVERAGE: {
    enabled: boolean;
    name: string;
    description: string;
    status: string;
  };
  TICKETING: {
    enabled: boolean;
    name: string;
    description: string;
    status: string;
  };
}

export type ThemeMode = 'light' | 'dark' | 'system';
