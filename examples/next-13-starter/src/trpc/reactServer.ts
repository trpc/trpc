import {
  createTRPCUntypedClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import { createTRPCNextAppRouterReactServer } from '@trpc/next-app-router/react-server';
import { headers } from 'next/headers';
import { cache } from 'react';
import superjson from 'superjson';
import { AppRouter } from '~/server/api/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouterReactServer<AppRouter>({
  getClient: cache(() =>
    createTRPCUntypedClient({
      transformer: superjson,
      links: [
        splitLink({
          condition: (op) => !!op.context.skipBatch,
          true: httpLink({
            url: getUrl(),
            fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
            headers() {
              return Object.fromEntries(headers());
            },
          }),
          false: httpBatchLink({
            url: getUrl(),
            fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
            headers() {
              return Object.fromEntries(headers());
            },
          }),
        }),
      ],
    }),
  ),
});
