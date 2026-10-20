import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-react-query';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';

import type { AppRouter } from './server.ts';

/**
 * The client and its TanStack Query helpers. `fetch` is the kitchen sink's
 * network, which sends each request to `server.ts`'s handler in this page;
 * an app leaves it out.
 */
export function createTrpc(
  fetch: (url: string, init: RequestInit) => Promise<Response>,
) {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: '/trpc', fetch })],
  });
  return { client, trpc: createTrpcQueryUtils({ client }) };
}

/** What the routes and the mutations get: the helpers and their cache. */
export interface AppContext extends ReturnType<typeof createTrpc> {
  readonly queryClient: QueryClient;
}
