import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import type { AppRouter } from '../server.ts';

/** The one client every page uses; each adapter wraps it. */
export const makeClient = (url = '/trpc') =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({ url, transformer: experimental_createProgressiveJson() }),
    ],
  });
export type Client = ReturnType<typeof makeClient>;
