import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpLink, routerType } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../../server';

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient({
  router: routerType<AppRouter>(),
  // httpLink, not httpBatchLink: batching links can't send FormData or files
  links: [httpLink({ url: 'http://localhost:2022' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
