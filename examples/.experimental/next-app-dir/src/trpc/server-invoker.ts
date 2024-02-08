import { loggerLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { appRouter } from '~/server/routers/_app';
import superjson from 'superjson';
import { createContext } from './shared-server';

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  createContext,
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
          transformer: superjson,
          // include the user id in the cache key
          cacheContext: (ctx) => [ctx.session?.user.id],
          createContext
        }),
      ],
    };
  },
});
