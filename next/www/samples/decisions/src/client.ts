/**
 * Typed clients of `./server.ts`, for blocks that call procedures.
 */
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';

import type { AppRouter } from './server.ts';

export const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});

export const safeClient = createSafeClient(client);

export type { AppRouter };
