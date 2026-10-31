import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../../server';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // the demo wants to show the error, not paper over it with retries
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2023' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
