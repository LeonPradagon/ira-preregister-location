import { describe, expect, it, vi } from 'vitest';
import { api } from '../../src/lib/apiClient';
import { adminQueryKey, dashboardQueryOptions } from '../../src/lib/adminQueries';
import { createAppQueryClient } from '../../src/lib/queryClient';

describe('admin query cache', () => {
  it('deduplicates simultaneous dashboard requests and refetches after invalidation', async () => {
    const client = createAppQueryClient();
    const admin = { id: 'admin-1', role: 'ADMIN' as const };
    const dashboard = { generatedAt: 'now' } as Awaited<ReturnType<typeof api.dashboard>>;
    const fetchDashboard = vi.spyOn(api, 'dashboard').mockResolvedValue(dashboard);

    try {
      const options = dashboardQueryOptions(admin);
      const [first, second] = await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
      expect(first).toBe(dashboard);
      expect(second).toBe(dashboard);
      expect(fetchDashboard).toHaveBeenCalledTimes(1);

      await client.invalidateQueries({ queryKey: adminQueryKey(admin), refetchType: 'none' });
      await client.fetchQuery(options);
      expect(fetchDashboard).toHaveBeenCalledTimes(2);
    } finally {
      fetchDashboard.mockRestore();
      client.clear();
    }
  });

  it('separates admin accounts and drops cached data on logout', async () => {
    const client = createAppQueryClient();
    const firstAdmin = { id: 'admin-1', role: 'ADMIN' as const };
    const secondAdmin = { id: 'admin-2', role: 'ADMIN' as const };
    const firstDashboard = { generatedAt: 'first' } as Awaited<ReturnType<typeof api.dashboard>>;
    const secondDashboard = { generatedAt: 'second' } as Awaited<ReturnType<typeof api.dashboard>>;
    const fetchDashboard = vi
      .spyOn(api, 'dashboard')
      .mockResolvedValueOnce(firstDashboard)
      .mockResolvedValueOnce(secondDashboard);

    try {
      expect(await client.fetchQuery(dashboardQueryOptions(firstAdmin))).toBe(firstDashboard);
      expect(await client.fetchQuery(dashboardQueryOptions(secondAdmin))).toBe(secondDashboard);
      expect(fetchDashboard).toHaveBeenCalledTimes(2);

      client.clear();
      expect(client.getQueryData(dashboardQueryOptions(firstAdmin).queryKey)).toBeUndefined();
      expect(client.getQueryData(dashboardQueryOptions(secondAdmin).queryKey)).toBeUndefined();
    } finally {
      fetchDashboard.mockRestore();
      client.clear();
    }
  });
});
