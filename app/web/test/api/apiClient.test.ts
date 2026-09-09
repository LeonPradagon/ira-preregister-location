import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiClient } from '../../src/lib/apiClient';

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Better Auth email sign-in with cookies enabled', async () => {
    const adapterMock = vi
      .fn()
      .mockResolvedValue({ status: 200, statusText: 'OK', headers: {}, data: { user: { id: 'admin-1' } } });
    apiClient.defaults.adapter = adapterMock;

    await api.signInEmail('admin@example.com', 'password');

    const config = adapterMock.mock.calls[0][0];
    expect(config.url).toBe('/api/auth/sign-in/email');
    expect(config.method).toBe('post');
    expect(config.withCredentials).toBe(true);
    expect(config.data).toBe(JSON.stringify({ email: 'admin@example.com', password: 'password', rememberMe: false }));
    expect(config.headers.get('x-correlation-id')).toEqual(expect.any(String));
  });

  it('calls the protected Admin verification endpoint with a correlation header', async () => {
    const adapterMock = vi
      .fn()
      .mockResolvedValue({ status: 200, statusText: 'OK', headers: {}, data: { status: 'SENT' } });
    apiClient.defaults.adapter = adapterMock;

    await api.resend('verification-1');

    const config = adapterMock.mock.calls[0][0];
    expect(config.url).toBe('/admin/verifications/verification-1/resend');
    expect(config.method).toBe('post');
    expect(config.withCredentials).toBe(true);
    expect(config.headers.get('x-correlation-id')).toEqual(expect.any(String));
  });

  it('requests paginated unverified customer candidates for campaigns', async () => {
    const adapterMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { items: [], page: 2, pageSize: 100, total: 1000, totalPages: 10 },
    });
    apiClient.defaults.adapter = adapterMock;

    await api.customers({ page: 2, pageSize: 100, locationStatus: 'UNVERIFIED', campaignAvailable: true });

    const config = adapterMock.mock.calls[0][0];
    expect(config.url).toBe(
      '/admin/customers?page=2&pageSize=100&locationStatus=UNVERIFIED&campaignAvailable=true',
    );
    expect(config.withCredentials).toBe(true);
  });

  it('normalizes API errors without exposing the raw Axios error', async () => {
    const adapterMock = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 401,
        headers: { 'x-correlation-id': 'server-correlation-id' },
        data: { error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid' } },
      },
    });
    apiClient.defaults.adapter = adapterMock;

    await expect(api.me()).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Sesi tidak valid',
      status: 401,
      code: 'UNAUTHORIZED',
      correlationId: 'server-correlation-id',
    });
  });
});
