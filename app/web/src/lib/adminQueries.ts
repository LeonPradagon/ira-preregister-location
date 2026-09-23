import { queryOptions } from '@tanstack/react-query';
import type { AdminUser } from '../types';
import { api } from './apiClient';

type QueryAdmin = Pick<AdminUser, 'id' | 'role'> | null;

export const adminQueryKey = (admin: QueryAdmin) => ['admin', admin?.id, admin?.role] as const;

// Include every request parameter in the key, including filters, sort and cursors.
export function adminQueryOptions<T>(
  admin: QueryAdmin,
  resource: string,
  queryFn: (context: { signal: AbortSignal }) => Promise<T>,
  parameters: unknown = null,
) {
  return queryOptions({
    queryKey: [...adminQueryKey(admin), resource, parameters],
    queryFn,
    enabled: Boolean(admin),
  });
}

export const dashboardQueryOptions = (admin: QueryAdmin, forceRefresh = false) =>
  adminQueryOptions(admin, 'dashboard', ({ signal }) => api.dashboard(forceRefresh, signal));

export const monitoringQueryOptions = (admin: QueryAdmin) =>
  adminQueryOptions(admin, 'monitoring', ({ signal }) => api.monitoring(signal));
