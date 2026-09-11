import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiClient, isUsableServerValidationDecision } from '../../src/lib/apiClient';

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an incomplete location decision before it reaches the UI', () => {
    expect(isUsableServerValidationDecision({ result: 'LOCATION_VALID', reasonCodes: [] })).toBe(false);
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

  it('requests customers by registered address completeness', async () => {
    const adapterMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 },
    });
    apiClient.defaults.adapter = adapterMock;

    await api.customers({ addressCompleteness: 'INCOMPLETE' });

    const config = adapterMock.mock.calls[0][0];
    expect(config.url).toBe('/admin/customers?addressCompleteness=INCOMPLETE');
  });

  it('allows the location submission to wait for reverse geocoding', async () => {
    const adapterMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        id: 'validation-1',
        status: 'LOCATION_VALID',
        result: 'LOCATION_VALID',
        reasonCodes: [],
        provinceMatch: true,
        cityMatch: true,
        districtMatch: true,
        subdistrictMatch: true,
        streetScore: 1,
        bestSample: {
          latitude: -6.2,
          longitude: 106.8,
          accuracyMeters: 10,
          capturedAt: '2026-09-11T00:00:00.000Z',
        },
        distanceFromReferenceMeters: null,
        addressScore: 1,
        sampleSpreadMeters: 0,
        capturedLocation: {
          latitude: -6.2,
          longitude: 106.8,
          accuracyMeters: 10,
          coordinateText: '-6.200000, 106.800000',
          googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=-6.2,106.8',
        },
      },
    });
    apiClient.defaults.adapter = adapterMock;

    await api.submitLocation('verification-token', [
      { latitude: -6.2, longitude: 106.8, accuracyMeters: 10, capturedAt: '2026-09-11T00:00:00.000Z' },
    ]);

    const config = adapterMock.mock.calls[0][0];
    expect(config.url).toBe('/public/verifications/verification-token/location');
    expect(config.timeout).toBe(60_000);
  });

  it('allows address geocoding requests to wait for the provider queue', async () => {
    const adapterMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { id: 'address-1', status: 'PROPOSED' },
    });
    apiClient.defaults.adapter = adapterMock;

    await api.changeAddress('verification-token', { street: 'Jl. Contoh' });

    expect(adapterMock.mock.calls[0][0].timeout).toBe(60_000);
  });

  it('allows address lookup to wait for the provider queue', async () => {
    const adapterMock = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { postalCode: '11520', formattedAddress: 'Jl. Contoh' },
    });
    apiClient.defaults.adapter = adapterMock;

    await api.lookupAddress('verification-token', { city: 'Jakarta Barat' });

    expect(adapterMock.mock.calls[0][0].timeout).toBe(60_000);
  });
});
