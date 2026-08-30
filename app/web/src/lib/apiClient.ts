const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000/v1').replace(/\/$/, '');
export const API_MODE = import.meta.env.VITE_API_MODE === 'true';

export interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export interface PublicVerificationContextApi {
  session: { id: string; status: string; expiresAt: string; customerConfirmationStatus: string; reminderCount: number };
  customer: { id: string; name: string; phoneE164: string };
  address: {
    id: string; rawAddress: string; province: string; city: string; district: string; subdistrict: string;
    street: string; houseNumber: string; referencePrecision: string;
  };
}

export interface ServerValidationDecision {
  id: string;
  result: string;
  reasonCodes: string[];
  bestSample: { latitude: number; longitude: number; accuracyMeters: number; capturedAt: string };
  distanceFromReferenceMeters: number;
  addressScore: number;
  sampleSpreadMeters: number;
  capturedLocation: { latitude: number; longitude: number; accuracyMeters: number; coordinateText: string; googleMapsUrl: string };
}

function correlationId(): string {
  return globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': correlationId(),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.error?.message || `API request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : (await response.json() as T);
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

export const authApi = {
  signInEmail: (email: string, password: string) => request<AuthSessionResponse>('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe: false }),
  }),
  getSession: () => request<AuthSessionResponse | null>('/api/auth/get-session'),
  signOut: () => request<void>('/api/auth/sign-out', { method: 'POST' }),
};

export const publicVerificationApi = {
  context: (token: string) => request<PublicVerificationContextApi>(`/public/verifications/${encodeURIComponent(token)}`),
  confirm: (token: string, confirmed: boolean) => request<{ status: string }>(`/public/verifications/${encodeURIComponent(token)}/customer-confirmation`, { method: 'POST', body: JSON.stringify({ confirmed }) }),
  consent: (token: string) => request<{ status: string }>(`/public/verifications/${encodeURIComponent(token)}/consent`, { method: 'POST' }),
  submitLocation: (token: string, samples: unknown[]) => request<ServerValidationDecision>(`/public/verifications/${encodeURIComponent(token)}/location`, { method: 'POST', body: JSON.stringify({ samples }) }),
  waitForHome: (token: string, reminderPreference: string) => request<{ status: string; reminderNumber: number }>(`/public/verifications/${encodeURIComponent(token)}/wait-for-home`, { method: 'POST', body: JSON.stringify({ reminderPreference }) }),
  changeAddress: (token: string, address: unknown) => request<{ id: string; status: string }>(`/public/verifications/${encodeURIComponent(token)}/address-change`, { method: 'POST', body: JSON.stringify(address) }),
};

export const adminApi = {
  me: () => request<AuthAdminApiUser>('/admin/me'),
  customers: () => request<Array<Record<string, unknown>>>('/admin/customers'),
  customer: (id: string) => request<Record<string, unknown>>(`/admin/customers/${encodeURIComponent(id)}`),
  createCustomer: (body: unknown) => request<Record<string, unknown>>('/admin/customers', { method: 'POST', body: JSON.stringify(body) }),
  verifications: () => request<Array<Record<string, unknown>>>('/admin/verifications'),
  verification: (id: string) => request<Record<string, unknown>>(`/admin/verifications/${encodeURIComponent(id)}`),
  createVerification: (customerId: string, addressId: string) => request<{ sessionId: string; verificationLink: string; expiresAt: string }>(`/admin/customers/${encodeURIComponent(customerId)}/verifications`, { method: 'POST', body: JSON.stringify({ addressId }) }),
  resend: (id: string) => request<{ status: string; verificationLink: string; expiresAt: string }>(`/admin/verifications/${encodeURIComponent(id)}/resend`, { method: 'POST' }),
  revoke: (id: string) => request<{ status: string }>(`/admin/verifications/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  reminder: (id: string) => request<{ status: string; reminderNumber: number; verificationLink: string; expiresAt: string }>(`/admin/verifications/${encodeURIComponent(id)}/reminders`, { method: 'POST' }),
  review: (id: string, body: unknown) => request<{ status: string }>(`/admin/verifications/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify(body) }),
  reminders: () => request<Array<Record<string, unknown>>>('/admin/reminders'),
  auditLogs: () => request<Array<Record<string, unknown>>>('/admin/audit-logs'),
  settings: () => request<Record<string, unknown>>('/admin/settings/validation'),
  updateSettings: (body: unknown) => request<Record<string, unknown>>('/admin/settings/validation', { method: 'PUT', body: JSON.stringify(body) }),
  integrations: () => request<Array<Record<string, unknown>>>('/admin/integrations'),
  outbox: () => request<Array<Record<string, unknown>>>('/admin/outbox'),
};
