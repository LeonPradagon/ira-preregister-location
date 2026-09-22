import axios, { AxiosRequestConfig } from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/v1').replace(/\/$/, '');
const API_TIMEOUT_MS = 15_000;
const PUBLIC_LOCATION_REQUEST_TIMEOUT_MS = 60_000;
const EXPORT_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
  message?: string | string[] | { [key: string]: unknown };
}

export interface CustomerExportJob {
  jobId: string;
  resource: 'customers' | 'addresses';
  format: 'xlsx' | 'csv';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  fileName: string | null;
  totalRows: number;
  processedRows: number;
  partCount: number;
  errorSummary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface PublicVerificationContextApi {
  session: {
    id: string;
    status: string;
    expiresAt: string;
    linkExpiresAt: string;
    customerConfirmationStatus: string;
    reminderCount: number;
    attemptCount: number;
    maxAttempts: number;
    maxReminders: number;
    isReminderLink: boolean;
    canScheduleReminder: boolean;
  };
  customer: { id: string; name: string; phoneE164: string };
  address: {
    id: string;
    addressType: string;
    rawAddress: string;
    province: string;
    city: string;
    district: string;
    subdistrict: string;
    postalCode?: string;
    street: string;
    houseNumber?: string;
    rt?: string | null;
    rw?: string | null;
    building?: string | null;
    block?: string | null;
    unit?: string | null;
    addressDetail?: string | null;
    landmark?: string | null;
    referencePrecision: string;
    requiresCorrection?: boolean;
    referenceLocation?: { latitude: number; longitude: number } | null;
    simulationConfig?: {
      homeRadiusMeters: number;
      gpsMaxAccuracyMeters: number;
      manualReview: boolean;
      autoApprovalEnabled: boolean;
      autoApprovalScoreThreshold: number;
    };
  };
  lastValidationResult?: PublicValidationResult;
}

export interface PublicValidationResult {
  result: string;
  reasonCodes: string[];
  provinceMatch: boolean;
  cityMatch: boolean;
  districtMatch: boolean;
  subdistrictMatch: boolean;
  streetScore: number;
  houseNumberMatch?: boolean | null;
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
}

export interface ServerValidationDecision extends PublicValidationResult {
  id: string;
  status?: string;
  attemptCount?: number;
  maxAttempts?: number;
  bestSample: { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string };
  distanceFromReferenceMeters: number | null;
  addressScore: number;
  sampleSpreadMeters: number;
  capturedLocation: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    coordinateText: string;
    googleMapsUrl: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isUsableServerValidationDecision(value: unknown): value is ServerValidationDecision {
  if (!isRecord(value)) return false;
  const bestSample = value.bestSample;
  const capturedLocation = value.capturedLocation;
  return (
    typeof value.id === 'string' &&
    typeof value.result === 'string' &&
    Array.isArray(value.reasonCodes) &&
    value.reasonCodes.every((code) => typeof code === 'string') &&
    typeof value.provinceMatch === 'boolean' &&
    typeof value.cityMatch === 'boolean' &&
    typeof value.districtMatch === 'boolean' &&
    typeof value.subdistrictMatch === 'boolean' &&
    isFiniteNumber(value.streetScore) &&
    isRecord(bestSample) &&
    isFiniteNumber(bestSample.latitude) &&
    isFiniteNumber(bestSample.longitude) &&
    isFiniteNumber(bestSample.accuracyMeters) &&
    typeof bestSample.capturedAt === 'string' &&
    isFiniteNumber(value.addressScore) &&
    isFiniteNumber(value.sampleSpreadMeters) &&
    (value.distanceFromReferenceMeters === null || isFiniteNumber(value.distanceFromReferenceMeters)) &&
    isRecord(capturedLocation) &&
    isFiniteNumber(capturedLocation.latitude) &&
    isFiniteNumber(capturedLocation.longitude) &&
    isFiniteNumber(capturedLocation.accuracyMeters) &&
    typeof capturedLocation.coordinateText === 'string' &&
    typeof capturedLocation.googleMapsUrl === 'string'
  );
}

function correlationId(): string {
  return globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const headers = config.headers;
  if (headers) {
    headers.set('Accept', 'application/json');
    headers.set('x-correlation-id', correlationId());
    const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
    if (!isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const body = error.response?.data as ApiErrorBody | undefined;
    const responseHeaders = error.response?.headers;
    const responseCorrelationId =
      typeof responseHeaders?.get === 'function'
        ? responseHeaders.get('x-correlation-id')
        : responseHeaders?.['x-correlation-id'];
    const topLevelMessage = Array.isArray(body?.message)
      ? body.message.join(', ')
      : typeof body?.message === 'string'
        ? body.message
        : undefined;
    const structuredMessage =
      body?.message && typeof body.message === 'object' && !Array.isArray(body.message)
        ? Object.entries(body.message)
            .flatMap(([section, value]) => {
              if (Array.isArray(value)) return value.map((item) => `${section}: ${String(item)}`);
              if (value && typeof value === 'object')
                return Object.entries(value).flatMap(([field, messages]) =>
                  Array.isArray(messages)
                    ? messages.map((item) => `${field}: ${String(item)}`)
                    : [`${field}: ${String(messages)}`],
                );
              return [`${section}: ${String(value)}`];
            })
            .join(', ')
        : undefined;
    const message =
      body?.error?.message ||
      topLevelMessage ||
      structuredMessage ||
      (!error.response
        ? 'Server tidak dapat dihubungi. Periksa koneksi Anda dan coba lagi.'
        : 'Permintaan tidak dapat diproses. Silakan coba lagi.');
    return Promise.reject(
      new ApiClientError(
        message,
        error.response?.status,
        body?.error?.code,
        typeof responseCorrelationId === 'string' ? responseCorrelationId : undefined,
      ),
    );
  },
);

type ApiRequestOptions = Pick<AxiosRequestConfig, 'method' | 'headers' | 'timeout'> & { body?: unknown };

async function request<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
  const response = await requestWithStatus<T>(path, init);
  return response.data;
}

async function requestWithStatus<T>(path: string, init: ApiRequestOptions = {}): Promise<{ data: T; status: number }> {
  if (!path.startsWith('/')) throw new Error('API path must be relative to the configured API base URL');
  const response = await apiClient.request<T>({
    url: path,
    method: init.method || 'GET',
    data: init.body,
    headers: init.headers,
    timeout: init.timeout,
  });
  return { data: response.status === 204 ? (undefined as T) : response.data, status: response.status };
}

export interface AuthAdminApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string | null;
}

export interface AdminManagedUser extends AuthAdminApiUser {
  disabledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionResponse {
  user?: AuthAdminApiUser;
  session?: { id: string; expiresAt: string };
}

type ApiNumeric = number | string;

export interface AdminDashboardApi {
  generatedAt: string;
  countAsOf?: string;
  customers: {
    total: ApiNumeric;
    active: ApiNumeric;
    verified: ApiNumeric;
    whatsappOptedIn: ApiNumeric;
    whatsappOptedOut: ApiNumeric;
  };
  verifications: {
    total: ApiNumeric;
    invitationsSent: ApiNumeric;
    linksOpened: ApiNumeric;
    customersConfirmed: ApiNumeric;
    customersMismatch: ApiNumeric;
    gpsCaptured: ApiNumeric;
    lowGpsAccuracy: ApiNumeric;
    waitingForHome: ApiNumeric;
    addressChanged: ApiNumeric;
    manualReview: ApiNumeric;
    locationValid: ApiNumeric;
    statusCounts: Record<string, ApiNumeric>;
    manualCaseCounts: Record<string, ApiNumeric>;
    workflowStages: {
      notStarted: ApiNumeric;
      invitationSent: ApiNumeric;
      linkOpened: ApiNumeric;
      gpsReceived: ApiNumeric;
      teamAction: ApiNumeric;
      matched: ApiNumeric;
    };
  };
  coordinateAudits: {
    statusCounts: Record<string, ApiNumeric>;
  };
  reminders: {
    total: ApiNumeric;
    scheduled: ApiNumeric;
    sent: ApiNumeric;
    failed: ApiNumeric;
    cancelled: ApiNumeric;
    cancelledByReason: Record<string, ApiNumeric>;
    byNumber: Record<string, ApiNumeric>;
  };
  outbox: {
    total: ApiNumeric;
    pending: ApiNumeric;
    published: ApiNumeric;
    failed: ApiNumeric;
  };
}

export interface CampaignMonitoringSummary {
  target: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  linksOpened: number;
  confirmed: number;
  gpsReceived: number;
  addressChanged: number;
  locationValid: number;
  manualReview: number;
  waitingForHome: number;
  reminders: {
    total: number;
    scheduled: number;
    sent: number;
    failed: number;
    cancelled: number;
    opened: number;
    byNumber: Record<string, number>;
  };
}

export interface AdminMonitoringCampaign extends CampaignMonitoringSummary {
  id: string;
  name: string;
  status: string;
  scheduledAt: string;
}

export interface AdminMonitoringSummary extends CampaignMonitoringSummary {
  campaigns: number;
}

export interface AdminMonitoringApi {
  generatedAt: string;
  summary: AdminMonitoringSummary;
  campaigns: AdminMonitoringCampaign[];
}

export interface CustomerImportApiResult {
  jobId?: string;
  fileName: string;
  status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  rowsProcessed?: number;
  rowsFailed?: number;
  rowsRead: number;
  customersUpserted: number;
  addressesUpdated: number;
  addressesInserted: number;
  duplicatePhoneRows: number;
  missingPostalCodeRowsStoredAs00000: number;
  missingCoordinateRows: number;
  incompleteAddressRows: number;
  coveredBtsRows: number;
  coverageStatusCounts: Record<string, number>;
  whatsappOptIn: string;
  referencePrecision: string;
  importedAt: string;
  errorSummary?: string | null;
}

export interface AdminPageApi<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  nextCursor: string | null;
  hasMore: boolean;
  countAsOf: string;
}

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  actor?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  cursor?: string;
}

export interface CoverageCandidateQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: 'NOT_CHECKED' | 'QUEUED' | 'PROCESSING' | 'COVERED' | 'UNCOVERED' | 'FAILED';
}

export interface CoverageCandidateApi {
  verificationId: string;
  customerId: string;
  customerExternalId: string;
  customerName: string;
  addressId: string;
  address: string;
  verificationStatus: string;
  latitude: number;
  longitude: number;
  coverageStatus: 'NOT_CHECKED' | 'QUEUED' | 'PROCESSING' | 'COVERED' | 'UNCOVERED' | 'FAILED';
  lastCheckedAt: string | null;
  importedCoverageStatus: string | null;
}

export interface CoverageBatchApi {
  batch: {
    id: string;
    providerKey: string;
    status: string;
    totalCount: number;
    completedCount: number;
    failedCount: number;
    createdAt: string;
    completedAt: string | null;
  };
}

function coverageQueryString(query: CoverageCandidateQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  const value = params.toString();
  return value ? `?${value}` : '';
}

function queryString(query: AdminListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search) params.set('search', query.search);
  if (query.status && query.status !== 'ALL') params.set('status', query.status);
  if (query.actor && query.actor !== 'ALL') params.set('actor', query.actor);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDirection) params.set('sortDirection', query.sortDirection);
  if (query.cursor) params.set('cursor', query.cursor);
  const value = params.toString();
  return value ? `?${value}` : '';
}

const authApi = {
  signInEmail: (email: string, password: string) =>
    request<AuthSessionResponse>('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe: false }),
    }),
  getSession: () => request<AuthSessionResponse | null>('/api/auth/get-session'),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
};

const publicVerificationApi = {
  regions: {
    provinces: () =>
      request<Array<{ code: string; name: string; postalCode?: string | null }>>('/public/regions/provinces'),
    regencies: (provinceCode: string) =>
      request<Array<{ code: string; name: string; postalCode?: string | null }>>(
        `/public/regions/regencies/${encodeURIComponent(provinceCode)}`,
      ),
    districts: (regencyCode: string) =>
      request<Array<{ code: string; name: string; postalCode?: string | null }>>(
        `/public/regions/districts/${encodeURIComponent(regencyCode)}`,
      ),
    villages: (districtCode: string) =>
      request<Array<{ code: string; name: string; postalCode?: string | null }>>(
        `/public/regions/villages/${encodeURIComponent(districtCode)}`,
      ),
  },
  context: (token: string) =>
    request<PublicVerificationContextApi>(`/public/verifications/${encodeURIComponent(token)}`),
  confirm: (token: string, confirmed: boolean) =>
    request<{ status: string }>(`/public/verifications/${encodeURIComponent(token)}/customer-confirmation`, {
      method: 'POST',
      body: JSON.stringify({ confirmed }),
    }),
  consent: (token: string) =>
    request<{ status: string }>(`/public/verifications/${encodeURIComponent(token)}/consent`, { method: 'POST' }),
  submitLocation: async (token: string, samples: unknown[]) => {
    const response = await request<unknown>(`/public/verifications/${encodeURIComponent(token)}/location`, {
      method: 'POST',
      body: JSON.stringify({ samples }),
      timeout: PUBLIC_LOCATION_REQUEST_TIMEOUT_MS,
    });
    if (!isUsableServerValidationDecision(response))
      throw new ApiClientError(
        'Hasil verifikasi lokasi tidak lengkap. Silakan coba pemeriksaan lokasi lagi.',
        502,
        'INVALID_LOCATION_RESPONSE',
      );
    return response;
  },
  waitForHome: (
    token: string,
    reminder: { scheduledAt?: string; reminderPreference?: string; reminderUntilAt?: string },
  ) =>
    request<{
      status: string;
      reminderNumber: number;
      reminderCount: number;
      scheduledAt: string;
      reminderUntilAt: string;
    }>(`/public/verifications/${encodeURIComponent(token)}/wait-for-home`, {
      method: 'POST',
      body: JSON.stringify(reminder),
    }),
  changeAddress: (token: string, address: unknown) =>
    request<{ id: string; status: string }>(`/public/verifications/${encodeURIComponent(token)}/address-change`, {
      method: 'POST',
      body: JSON.stringify(address),
      timeout: PUBLIC_LOCATION_REQUEST_TIMEOUT_MS,
    }),
  lookupAddress: (token: string, address: unknown) =>
    request<{ postalCode: string | null; formattedAddress: string }>(
      `/public/verifications/${encodeURIComponent(token)}/address-lookup`,
      { method: 'POST', body: JSON.stringify(address), timeout: PUBLIC_LOCATION_REQUEST_TIMEOUT_MS },
    ),
  addressStatus: (token: string, sameAddress: boolean) =>
    request<{ status: string; sameAddress: boolean }>(
      `/public/verifications/${encodeURIComponent(token)}/address-status`,
      { method: 'POST', body: JSON.stringify({ sameAddress }) },
    ),
};

const adminApi = {
  me: () => request<AuthAdminApiUser>('/admin/me'),
  users: (search = '') =>
    request<{ items: AdminManagedUser[]; total: number }>(
      `/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  createUser: (body: { name: string; email: string; password: string; role: string; department?: string }) =>
    request<AdminManagedUser>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: { name?: string; role?: string; department?: string | null }) =>
    request<AdminManagedUser>(`/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  resetUserPassword: (id: string, password: string) =>
    request<{ id: string; status: string }>(`/admin/users/${encodeURIComponent(id)}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  disableUser: (id: string) =>
    request<{ id: string; status: string; disabledAt: string | null }>(
      `/admin/users/${encodeURIComponent(id)}/disable`,
      { method: 'POST' },
    ),
  enableUser: (id: string) =>
    request<{ id: string; status: string; disabledAt: string | null }>(
      `/admin/users/${encodeURIComponent(id)}/enable`,
      { method: 'POST' },
    ),
  dashboard: (forceRefresh = false) =>
    request<AdminDashboardApi>(`/admin/dashboard${forceRefresh ? '?refresh=true' : ''}`),
  monitoring: () => request<AdminMonitoringApi>('/admin/monitoring'),
  customers: (
    query: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      whatsappStatus?: 'ALL' | 'VALID_FORMAT' | 'FORMAT_INVALID' | 'NOT_CHECKED' | 'ACCEPTED' | 'DELIVERED' | 'READ' | 'FAILED' | 'NOT_ON_WHATSAPP';
      locationStatus?: 'UNVERIFIED' | 'VERIFIED';
      coordinateAuditStatus?: 'PENDING' | 'MATCHED' | 'UNCERTAIN' | 'MISMATCH' | 'INVALID';
      addressCompleteness?: 'COMPLETE' | 'INCOMPLETE';
      coverageFwaStatus?: string;
      coverageFtthStatus?: string;
      campaignAvailable?: boolean;
      sortBy?: string;
      sortDirection?: 'asc' | 'desc';
      cursor?: string;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    if (query.search) params.set('search', query.search);
    if (query.status && query.status !== 'ALL') params.set('status', query.status);
    if (query.whatsappStatus && query.whatsappStatus !== 'ALL') params.set('whatsappStatus', query.whatsappStatus);
    if (query.locationStatus) params.set('locationStatus', query.locationStatus);
    if (query.coordinateAuditStatus) params.set('coordinateAuditStatus', query.coordinateAuditStatus);
    if (query.addressCompleteness) params.set('addressCompleteness', query.addressCompleteness);
    if (query.coverageFwaStatus && query.coverageFwaStatus !== 'ALL') params.set('coverageFwaStatus', query.coverageFwaStatus);
    if (query.coverageFtthStatus && query.coverageFtthStatus !== 'ALL') params.set('coverageFtthStatus', query.coverageFtthStatus);
    if (query.campaignAvailable) params.set('campaignAvailable', 'true');
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortDirection) params.set('sortDirection', query.sortDirection);
    if (query.cursor) params.set('cursor', query.cursor);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{
      items: Array<Record<string, unknown>>;
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      nextCursor: string | null;
      hasMore: boolean;
      countAsOf: string;
    }>(`/admin/customers${suffix}`);
  },
  exportCustomers: async (query: {
    resource: 'customers' | 'addresses';
    format: 'xlsx' | 'csv';
    search?: string;
    status?: string;
    whatsappStatus?: 'VALID_FORMAT' | 'FORMAT_INVALID' | 'NOT_CHECKED' | 'ACCEPTED' | 'DELIVERED' | 'READ' | 'FAILED' | 'NOT_ON_WHATSAPP';
    coordinateAuditStatus?: 'PENDING' | 'MATCHED' | 'UNCERTAIN' | 'MISMATCH' | 'INVALID';
    addressCompleteness?: 'COMPLETE' | 'INCOMPLETE';
    coverageFwaStatus?: string;
    coverageFtthStatus?: string;
  }) =>
    request<CustomerExportJob>('/admin/exports/customers', {
      method: 'POST',
      body: JSON.stringify({
        ...query,
        status: query.status && query.status !== 'ALL' ? query.status : undefined,
        coverageFwaStatus: query.coverageFwaStatus && query.coverageFwaStatus !== 'ALL' ? query.coverageFwaStatus : undefined,
        coverageFtthStatus: query.coverageFtthStatus && query.coverageFtthStatus !== 'ALL' ? query.coverageFtthStatus : undefined,
      }),
    }),
  getCustomerExportJob: (jobId: string) =>
    request<CustomerExportJob>(`/admin/exports/customers/jobs/${encodeURIComponent(jobId)}`),
  downloadCustomerExport: async (jobId: string, query: { resource: 'customers' | 'addresses'; format: 'xlsx' | 'csv' }) => {
    const response = await apiClient.get<ArrayBuffer>(
      `/admin/exports/customers/jobs/${encodeURIComponent(jobId)}/download`,
      {
      responseType: 'arraybuffer',
        timeout: EXPORT_DOWNLOAD_TIMEOUT_MS,
      },
    );
    const disposition = response.headers['content-disposition'];
    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    const fallbackFileName = contentType.includes('zip')
      ? `ira_${query.resource}_export.zip`
      : `ira_${query.resource}_part_001.${query.format}`;
    const fileName =
      typeof disposition === 'string'
        ? disposition.match(/filename="([^"]+)"/)?.[1] || fallbackFileName
        : fallbackFileName;
    return { blob: new Blob([response.data], { type: contentType }), fileName };
  },
  customer: (id: string) => request<Record<string, unknown>>(`/admin/customers/${encodeURIComponent(id)}`),
  createCustomer: (body: unknown) =>
    request<Record<string, unknown>>('/admin/customers', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: unknown) =>
    request<{ customer: Record<string, unknown>; address?: Record<string, unknown> }>(
      `/admin/customers/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  deleteCustomer: (id: string) =>
    request<{ id: string; status: string }>(`/admin/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importCustomers: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<CustomerImportApiResult>('/admin/import-jobs', { method: 'POST', body, timeout: 60_000 });
  },
  importJob: (id: string) => request<CustomerImportApiResult>(`/admin/import-jobs/${encodeURIComponent(id)}`),
  verifications: (query: AdminListQuery = {}) =>
    request<
      AdminPageApi<{
        session: Record<string, unknown>;
        customer: Record<string, unknown>;
        address: Record<string, unknown>;
      }>
    >(
      `/admin/verifications${queryString(query)}`,
    ),
  verification: (id: string) => request<Record<string, unknown>>(`/admin/verifications/${encodeURIComponent(id)}`),
  addressFromGps: (id: string) =>
    request<{
      status: string;
      addressId: string;
      updatedFields: string[];
      referenceLocation: { latitude: number; longitude: number };
    }>(`/admin/verifications/${encodeURIComponent(id)}/address-from-gps`, { method: 'POST' }),
  createVerification: (customerId: string, addressId: string) =>
    request<{ sessionId: string; verificationLink: string; expiresAt: string }>(
      `/admin/customers/${encodeURIComponent(customerId)}/verifications`,
      { method: 'POST', body: JSON.stringify({ addressId }) },
    ),
  createSimulationVerification: (customerId: string, addressId: string) =>
    request<{
      simulation: boolean;
      sessionId: string;
      recipient: { name: string; phoneE164: string };
      templateName: string;
      language: string;
      message: string;
      verificationLink: string;
      referenceLocation: { latitude: number; longitude: number } | null;
      referencePrecision: string | null;
      simulationConfig: {
        homeRadiusMeters: number;
        gpsMaxAccuracyMeters: number;
        manualReview: boolean;
        autoApprovalEnabled: boolean;
        autoApprovalScoreThreshold: number;
      };
      expiresAt: string;
    }>(`/admin/customers/${encodeURIComponent(customerId)}/verifications/simulation`, {
      method: 'POST',
      body: JSON.stringify({ addressId }),
    }),
  resend: (id: string) =>
    request<{ status: string; verificationLink: string; expiresAt: string }>(
      `/admin/verifications/${encodeURIComponent(id)}/resend`,
      { method: 'POST' },
    ),
  restartVerification: (id: string) =>
    request<{
      status: string;
      sessionId: string;
      verificationLink: string;
      expiresAt: string;
      previousSessionId: string;
    }>(`/admin/verifications/${encodeURIComponent(id)}/restart`, { method: 'POST' }),
  revoke: (id: string) =>
    request<{ status: string }>(`/admin/verifications/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  reminder: (id: string) =>
    request<{ status: string; reminderNumber: number }>(`/admin/verifications/${encodeURIComponent(id)}/reminders`, {
      method: 'POST',
    }),
  review: (id: string, body: unknown) =>
    request<{ status: string }>(`/admin/verifications/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reminders: (query: AdminListQuery = {}) =>
    request<AdminPageApi<Record<string, unknown>>>(`/admin/reminders${queryString(query)}`),
  auditLogs: (query: AdminListQuery = {}) =>
    request<AdminPageApi<Record<string, unknown>>>(`/admin/audit-logs${queryString(query)}`),
  auditLogsWithStatus: (query: AdminListQuery = {}) =>
    requestWithStatus<AdminPageApi<Record<string, unknown>>>(`/admin/audit-logs${queryString(query)}`),
  settings: () => request<Record<string, unknown>>('/admin/settings/validation'),
  updateSettings: (body: unknown) =>
    request<Record<string, unknown>>('/admin/settings/validation', { method: 'PUT', body: JSON.stringify(body) }),
  integrations: () => request<Array<Record<string, unknown>>>('/admin/integrations'),
  coverageCandidates: (query: CoverageCandidateQuery = {}) =>
    request<AdminPageApi<CoverageCandidateApi>>(`/admin/coverage/candidates${coverageQueryString(query)}`),
  enqueueCoverageChecks: (verificationIds: string[]) =>
    request<{ batchId: string; queuedCount: number; skippedCount: number }>('/admin/coverage/checks', {
      method: 'POST',
      body: JSON.stringify({ verificationIds }),
    }),
  coverageBatch: (id: string) => request<CoverageBatchApi>(`/admin/coverage/batches/${encodeURIComponent(id)}`),
  outbox: (query: AdminListQuery = {}) =>
    request<AdminPageApi<Record<string, unknown>>>(`/admin/outbox${queryString(query)}`),
  campaigns: (query: AdminListQuery = {}) =>
    request<AdminPageApi<Record<string, unknown>>>(`/admin/campaigns${queryString(query)}`),
  campaign: (id: string) => request<Record<string, unknown>>(`/admin/campaigns/${encodeURIComponent(id)}`),
  campaignItems: (id: string, query: AdminListQuery = {}) =>
    request<AdminPageApi<Record<string, unknown>> & { monitoring: CampaignMonitoringSummary }>(
      `/admin/campaigns/${encodeURIComponent(id)}/items${queryString(query)}`,
    ),
  downloadCampaignExport: async (id: string, format: 'xlsx' | 'csv') => {
    const response = await apiClient.get<ArrayBuffer>(
      `/admin/campaigns/${encodeURIComponent(id)}/export?format=${format}`,
      { responseType: 'arraybuffer', timeout: EXPORT_DOWNLOAD_TIMEOUT_MS },
    );
    const disposition = response.headers['content-disposition'];
    const fallbackFileName = `ira_campaign_${id}_monitoring.${format}`;
    const fileName =
      typeof disposition === 'string'
        ? disposition.match(/filename="([^"]+)"/)?.[1] || fallbackFileName
        : fallbackFileName;
    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    return { blob: new Blob([response.data], { type: contentType }), fileName };
  },
  createCampaign: (body: unknown) =>
    request<Record<string, unknown>>('/admin/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  previewWhatsApp: (body: {
    customerName: string;
    phoneE164: string;
    address?: string;
    referenceLatitude?: number;
    referenceLongitude?: number;
    referencePrecision?: string;
  }) =>
    request<{
      simulation: boolean;
      recipient: { name: string; phoneE164: string };
      templateName: string;
      language: string;
      message: string;
      verificationLink: string;
      referenceLocation: { latitude: number; longitude: number } | null;
      referencePrecision: string | null;
      simulationConfig: {
        homeRadiusMeters: number;
        gpsMaxAccuracyMeters: number;
        manualReview: boolean;
        autoApprovalEnabled: boolean;
        autoApprovalScoreThreshold: number;
      };
    }>('/admin/campaigns/preview-whatsapp', { method: 'POST', body: JSON.stringify(body) }),
  startCampaign: (id: string) =>
    request<{ id: string; status: string }>(`/admin/campaigns/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  optOutCustomer: (id: string) =>
    request<{ customerId: string; status: string }>(`/admin/customers/${encodeURIComponent(id)}/whatsapp-opt-out`, {
      method: 'POST',
    }),
};

/**
 * Public API facade. Import `api` from this file instead of maintaining a
 * separate client per screen.
 */
export const api = {
  ...authApi,
  ...publicVerificationApi,
  ...adminApi,
};
