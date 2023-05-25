'use server';

import { loggerLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { headers } from 'next/headers';
import SuperJSON from 'superjson';
import { appRouter } from '~/server/routers/_app';

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      transformer: SuperJSON,
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        experimental_nextCacheLink({
          staleTime: 5,
          router: appRouter,
          createContext: async () => {
            const h = Object.fromEntries(headers().entries());
            return { headers: h };
          },
        }),
      ],
    };
  },
});
