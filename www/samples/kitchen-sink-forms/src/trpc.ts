import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';

import type { AppRouter } from './server.ts';

// #region client
/**
 * The client, its cache and its TanStack Query helpers, which start queries
 * in that cache for the loaders (`$ensure()`, `$prefetch()`). `fetch` is the
 * kitchen sink's network, which sends each request to `server.ts`'s handler
 * in this page; an app leaves it out.
 */
export function createTrpc(
  fetch: typeof globalThis.fetch,
  queryClient: QueryClient,
) {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc', fetch })],
  });
  return {
    client,
    queryClient,
    trpc: createTrpcQueryUtils({ client, queryClient }),
  };
}
// #endregion client
