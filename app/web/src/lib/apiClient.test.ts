import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi, authApi } from './apiClient';

describe('API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends Better Auth email sign-in with cookies enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'admin-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await authApi.signInEmail('admin@example.com', 'password');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/sign-in/email'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'admin@example.com', password: 'password', rememberMe: false }),
      }),
    );
  });

  it('calls the protected Admin verification endpoint with a correlation header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'SENT' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await adminApi.resend('verification-1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/verifications/verification-1/resend'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'x-correlation-id': expect.any(String) }),
      }),
    );
  });
});
