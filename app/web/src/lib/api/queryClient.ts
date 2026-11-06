import { QueryClient } from '@tanstack/react-query';

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Keep refresh explicit while admin tabs stay mounted in the background.
        refetchOnWindowFocus: false,
        retry: false,
      },
      // Sending invitations, reminders and GPS attempts must never retry implicitly.
      mutations: { retry: false },
    },
  });
}
