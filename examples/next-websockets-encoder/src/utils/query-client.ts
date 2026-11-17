import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // keep server-rendered data fresh for a while, so the
        // client doesn't fetch it again as soon as the page loads
        staleTime: 30 * 1000,
      },
    },
  });
}
