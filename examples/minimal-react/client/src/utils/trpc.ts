import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, routerType } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../../server';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ...
    },
  },
});

const trpcClient = createTRPCClient({
  router: routerType<AppRouter>(),
  links: [httpBatchLink({ url: 'http://localhost:2022' })],
});

export const trpc = createTRPCOptionsProxy({
  client: trpcClient,
  queryClient,
});
