'use server';

import {
  createTRPCUntypedClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import { createTRPCNextAppRouterReactServer } from '@trpc/next-app-router/react-server';
import { headers } from 'next/headers';
import { cache } from 'react';
import { AppRouter } from '~/server/api/router';
import { getUrl, transformer } from './shared';

export const api = createTRPCNextAppRouterReactServer<AppRouter>({
  getClient: cache(() =>
    createTRPCUntypedClient({
      transformer,
      links: [
        splitLink({
          condition: (op) => !!op.context.skipBatch,
          true: httpLink({
            url: getUrl(),
            // fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
            headers() {
              const { connection: _, ...h } = Object.fromEntries(headers());
              return h;
            },
          }),
          false: httpBatchLink({
            url: getUrl(),
            // fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
            headers() {
              const { connection: _, ...h } = Object.fromEntries(headers());
              return h;
            },
          }),
        }),
      ],
    }),
  ),
});
