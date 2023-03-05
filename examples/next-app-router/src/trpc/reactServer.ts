import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { createTRPCNextAppRouter } from '@trpc/next-app-router';
import { headers } from 'next/headers';
import { cache } from 'react';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouter<AppRouter>({
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
