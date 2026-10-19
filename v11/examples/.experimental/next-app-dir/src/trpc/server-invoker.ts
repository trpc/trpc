import { loggerLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { auth } from '~/auth';
import { appRouter } from '~/server/routers/_app';
import { cookies } from 'next/headers';
import { transformer } from './shared';

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        experimental_nextCacheLink({
          // requests are cached for 5 seconds
          revalidate: 5,
          router: appRouter,
          transformer,
          createContext: async () => {
            return {
              session: await auth(),
              headers: {
                cookie: (await cookies()).toString(),
                'x-trpc-source': 'rsc-invoke',
              },
            };
          },
        }),
      ],
    };
  },
});
