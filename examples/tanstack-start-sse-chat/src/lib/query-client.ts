import { QueryClient } from '@tanstack/react-query';
import { isTRPCClientError } from '@trpc/client';

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        // Asking again doesn't make a missing post appear
        retry: (failureCount, error) =>
          failureCount < 3 &&
          !(isTRPCClientError(error) && error.data?.code === 'NOT_FOUND'),
      },
    },
  });
