'use server';

import { loggerLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { appRouter } from '~/server/routers/_app';
import { headers } from 'next/headers';
import SuperJSON from 'superjson';

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      transformer: SuperJSON,
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        experimental_nextCacheLink({
          // requests are cached for 5 seconds
          revalidate: 5,
          router: appRouter,
          createContext: async () => {
            // const newHeaders = new Map(headers());
            // // newHeaders.delete('connection');
            // newHeaders.set('x-trpc-source', 'rsc-invoke');
            return { headers: undefined };
          },
        }),
      ],
    };
  },
});
