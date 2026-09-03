import axios, { AxiosRequestConfig } from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/v1').replace(/\/$/, '');
const API_TIMEOUT_MS = 15_000;

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
  message?: string | string[] | { [key: string]: unknown };
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
  session: { id: string; status: string; expiresAt: string; linkExpiresAt: string; customerConfirmationStatus: string; reminderCount: number };
  customer: { id: string; name: string; phoneE164: string };
  address: {
    id: string; addressType: string; rawAddress: string; province: string; city: string; district: string; subdistrict: string;
    street: string; houseNumber: string; referencePrecision: string; referenceLocation?: { latitude: number; longitude: number } | null; simulationConfig?: { homeRadiusMeters: number; gpsMaxAccuracyMeters: number; manualReview?: boolean };
  };
}

export interface ServerValidationDecision {
  id: string;
  result: string;
  reasonCodes: string[];
  bestSample: { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string };
  distanceFromReferenceMeters: number | null;
  addressScore: number;
  sampleSpreadMeters: number;
  capturedLocation: { latitude: number; longitude: number; accuracyMeters: number; coordinateText: string; googleMapsUrl: string };
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
    const responseCorrelationId = typeof responseHeaders?.get === 'function'
      ? responseHeaders.get('x-correlation-id')
      : responseHeaders?.['x-correlation-id'];
    const topLevelMessage = Array.isArray(body?.message)
      ? body.message.join(', ')
      : typeof body?.message === 'string'
        ? body.message
        : undefined;
    const structuredMessage = body?.message && typeof body.message === 'object' && !Array.isArray(body.message)
      ? Object.entries(body.message).flatMap(([section, value]) => {
        if (Array.isArray(value)) return value.map((item) => `${section}: ${String(item)}`);
        if (value && typeof value === 'object') return Object.entries(value).flatMap(([field, messages]) => Array.isArray(messages) ? messages.map((item) => `${field}: ${String(item)}`) : [`${field}: ${String(messages)}`]);
        return [`${section}: ${String(value)}`];
      }).join(', ')
      : undefined;
    const message = body?.error?.message || topLevelMessage || structuredMessage
      || (!error.response ? 'Server backend tidak dapat dihubungi. Pastikan npm run dev:server sedang berjalan di port 3000.' : 'Permintaan tidak dapat diproses. Silakan coba lagi.');
    return Promise.reject(new ApiClientError(
      message,
      error.response?.status,
      body?.error?.code,
      typeof responseCorrelationId === 'string' ? responseCorrelationId : undefined,
    ));
  },
);

type ApiRequestOptions = Pick<AxiosRequestConfig, 'method' | 'headers' | 'timeout'> & { body?: unknown };

async function request<T>(path: string, init: ApiRequestOptions = {}): Promise<T> {
  if (!path.startsWith('/')) throw new Error('API path must be relative to the configured API base URL');
  const response = await apiClient.request<T>({
    url: path,
    method: init.method || 'GET',
    data: init.body,
    headers: init.headers,
    timeout: init.timeout,
  });
  return response.status === 204 ? (undefined as T) : response.data;
}

export interface AuthAdminApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string | null;
}

export interface AuthSessionResponse {
  user?: AuthAdminApiUser;
  session?: { id: string; expiresAt: string };
}

type ApiNumeric = number | string;

export interface AdminDashboardApi {
  generatedAt: string;
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
  };
  reminders: {
    total: ApiNumeric;
    scheduled: ApiNumeric;
    sent: ApiNumeric;
    failed: ApiNumeric;
    cancelled: ApiNumeric;
    byNumber: Record<string, ApiNumeric>;
  };
  outbox: {
    total: ApiNumeric;
    pending: ApiNumeric;
    published: ApiNumeric;
    failed: ApiNumeric;
  };
}

export interface CustomerImportApiResult {
  fileName: string;
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
}

export interface AdminPageApi<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  actor?: string;
  cursor?: string;
}

function queryString(query: AdminListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.search) params.set('search', query.search);
  if (query.status && query.status !== 'ALL') params.set('status', query.status);
  if (query.actor && query.actor !== 'ALL') params.set('actor', query.actor);
  if (query.cursor) params.set('cursor', query.cursor);
  const value = params.toString();
  return value ? `?${value}` : '';
}

const authApi = {
  signInEmail: (email: string, password: string) => request<AuthSessionResponse>('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe: false }),
  }),
  getSession: () => request<AuthSessionResponse | null>('/api/auth/get-session'),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
};

const publicVerificationApi = {
  regions: {
    provinces: () => request<Array<{ code: string; name: string; postalCode?: string | null }>>('/public/regions/provinces'),
    regencies: (provinceCode: string) => request<Array<{ code: string; name: string; postalCode?: string | null }>>(`/public/regions/regencies/${encodeURIComponent(provinceCode)}`),
    districts: (regencyCode: string) => request<Array<{ code: string; name: string; postalCode?: string | null }>>(`/public/regions/districts/${encodeURIComponent(regencyCode)}`),
    villages: (districtCode: string) => request<Array<{ code: string; name: string; postalCode?: string | null }>>(`/public/regions/villages/${encodeURIComponent(districtCode)}`),
  },
  context: (token: string) => request<PublicVerificationContextApi>(`/public/verifications/${encodeURIComponent(token)}`),
  confirm: (token: string, confirmed: boolean) => request<{ status: string }>(`/public/verifications/${encodeURIComponent(token)}/customer-confirmation`, { method: 'POST', body: JSON.stringify({ confirmed }) }),
  consent: (token: string) => request<{ status: string }>(`/public/verifications/${encodeURIComponent(token)}/consent`, { method: 'POST' }),
  submitLocation: (token: string, samples: unknown[]) => request<ServerValidationDecision>(`/public/verifications/${encodeURIComponent(token)}/location`, { method: 'POST', body: JSON.stringify({ samples }) }),
  waitForHome: (token: string, reminder: { scheduledAt?: string; reminderPreference?: string; reminderUntilAt: string }) => request<{ status: string; reminderNumber: number; reminderCount: number; scheduledAt: string; reminderUntilAt: string }>(`/public/verifications/${encodeURIComponent(token)}/wait-for-home`, { method: 'POST', body: JSON.stringify(reminder) }),
  changeAddress: (token: string, address: unknown) => request<{ id: string; status: string }>(`/public/verifications/${encodeURIComponent(token)}/address-change`, { method: 'POST', body: JSON.stringify(address) }),
  lookupAddress: (token: string, address: unknown) => request<{ postalCode: string | null; formattedAddress: string }>(`/public/verifications/${encodeURIComponent(token)}/address-lookup`, { method: 'POST', body: JSON.stringify(address) }),
  addressStatus: (token: string, sameAddress: boolean) => request<{ status: string; sameAddress: boolean }>(`/public/verifications/${encodeURIComponent(token)}/address-status`, { method: 'POST', body: JSON.stringify({ sameAddress }) }),
};

const adminApi = {
  me: () => request<AuthAdminApiUser>('/admin/me'),
  dashboard: () => request<AdminDashboardApi>('/admin/dashboard'),
  customers: (query: { page?: number; pageSize?: number; search?: string; status?: string; locationStatus?: 'UNVERIFIED' | 'VERIFIED'; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    if (query.search) params.set('search', query.search);
    if (query.status && query.status !== 'ALL') params.set('status', query.status);
    if (query.locationStatus) params.set('locationStatus', query.locationStatus);
    if (query.cursor) params.set('cursor', query.cursor);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{ items: Array<Record<string, unknown>>; page: number; pageSize: number; total: number; totalPages: number }>(`/admin/customers${suffix}`);
  },
  customer: (id: string) => request<Record<string, unknown>>(`/admin/customers/${encodeURIComponent(id)}`),
  createCustomer: (body: unknown) => request<Record<string, unknown>>('/admin/customers', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: unknown) => request<{ customer: Record<string, unknown>; address?: Record<string, unknown> }>(`/admin/customers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCustomer: (id: string) => request<{ id: string; status: string }>(`/admin/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importCustomers: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<CustomerImportApiResult>('/admin/customers/import', { method: 'POST', body, timeout: 5 * 60 * 1000 });
  },
  verifications: (query: AdminListQuery = {}) => request<AdminPageApi<{ session: Record<string, unknown>; customer: Record<string, unknown> }>>(`/admin/verifications${queryString(query)}`),
  verification: (id: string) => request<Record<string, unknown>>(`/admin/verifications/${encodeURIComponent(id)}`),
  addressFromGps: (id: string) => request<{ status: string; addressId: string; updatedFields: string[]; referenceLocation: { latitude: number; longitude: number } }>(`/admin/verifications/${encodeURIComponent(id)}/address-from-gps`, { method: 'POST' }),
  createVerification: (customerId: string, addressId: string) => request<{ sessionId: string; verificationLink: string; expiresAt: string }>(`/admin/customers/${encodeURIComponent(customerId)}/verifications`, { method: 'POST', body: JSON.stringify({ addressId }) }),
  createSimulationVerification: (customerId: string, addressId: string) => request<{ simulation: boolean; sessionId: string; recipient: { name: string; phoneE164: string }; templateName: string; language: string; message: string; verificationLink: string; referenceLocation: { latitude: number; longitude: number } | null; referencePrecision: string | null; simulationConfig: { homeRadiusMeters: number; gpsMaxAccuracyMeters: number }; expiresAt: string }>(`/admin/customers/${encodeURIComponent(customerId)}/verifications/simulation`, { method: 'POST', body: JSON.stringify({ addressId }) }),
  resend: (id: string) => request<{ status: string; verificationLink: string; expiresAt: string }>(`/admin/verifications/${encodeURIComponent(id)}/resend`, { method: 'POST' }),
  revoke: (id: string) => request<{ status: string }>(`/admin/verifications/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  reminder: (id: string) => request<{ status: string; reminderNumber: number }>(`/admin/verifications/${encodeURIComponent(id)}/reminders`, { method: 'POST' }),
  review: (id: string, body: unknown) => request<{ status: string }>(`/admin/verifications/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify(body) }),
  reminders: (query: AdminListQuery = {}) => request<AdminPageApi<Record<string, unknown>>>(`/admin/reminders${queryString(query)}`),
  auditLogs: (query: AdminListQuery = {}) => request<AdminPageApi<Record<string, unknown>>>(`/admin/audit-logs${queryString(query)}`),
  settings: () => request<Record<string, unknown>>('/admin/settings/validation'),
  updateSettings: (body: unknown) => request<Record<string, unknown>>('/admin/settings/validation', { method: 'PUT', body: JSON.stringify(body) }),
  integrations: () => request<Array<Record<string, unknown>>>('/admin/integrations'),
  outbox: (query: AdminListQuery = {}) => request<AdminPageApi<Record<string, unknown>>>(`/admin/outbox${queryString(query)}`),
  campaigns: (query: AdminListQuery = {}) => request<AdminPageApi<Record<string, unknown>>>(`/admin/campaigns${queryString(query)}`),
  campaign: (id: string) => request<Record<string, unknown>>(`/admin/campaigns/${encodeURIComponent(id)}`),
  campaignItems: (id: string, query: AdminListQuery = {}) => request<AdminPageApi<Record<string, unknown>>>(`/admin/campaigns/${encodeURIComponent(id)}/items${queryString(query)}`),
  createCampaign: (body: unknown) => request<Record<string, unknown>>('/admin/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  previewWhatsApp: (body: { customerName: string; phoneE164: string; address?: string; referenceLatitude?: number; referenceLongitude?: number; referencePrecision?: string }) => request<{ simulation: boolean; recipient: { name: string; phoneE164: string }; templateName: string; language: string; message: string; verificationLink: string; referenceLocation: { latitude: number; longitude: number } | null; referencePrecision: string | null; simulationConfig: { homeRadiusMeters: number; gpsMaxAccuracyMeters: number } }>('/admin/campaigns/preview-whatsapp', { method: 'POST', body: JSON.stringify(body) }),
  startCampaign: (id: string) => request<{ id: string; status: string }>(`/admin/campaigns/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  optOutCustomer: (id: string) => request<{ customerId: string; status: string }>(`/admin/customers/${encodeURIComponent(id)}/whatsapp-opt-out`, { method: 'POST' }),
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
