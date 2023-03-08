import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { createTRPCNextAppRouterReactServer } from '@trpc/next-app-router/react-server';
import { headers } from 'next/headers';
import { cache } from 'react';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouterReactServer<AppRouter>({
  getClient: cache(() =>
    createTRPCUntypedClient({
      links: [
        httpBatchLink({
          url: getUrl(),
          headers() {
            return Object.fromEntries(headers());
          },
        }),
      ],
    }),
  ),
});
