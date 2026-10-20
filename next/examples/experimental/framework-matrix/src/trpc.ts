import {
  createTrpcClient,
  httpStreamLink,
  routerType,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import type { AppRouter } from '../server.ts';

/** The one client every page uses; each adapter wraps it. */
export const makeClient = (url = '/trpc') =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpStreamLink({ url, serializer: createSerializer() })],
  });
export type Client = ReturnType<typeof makeClient>;
