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
  config() {
    return {
      createContext: () => createContext('invoke'),
      contextSelector: (ctx, callOpts) => {
        if (!['privateGreeting'].includes(callOpts.path[0])) return [];
        return [ctx.session?.user.id, ctx._userIdMock];
      },
      links: [
        loggerLink({
          enabled: (_op) => true,
        }),
        experimental_nextCacheLink({
          // requests are cached for 5 seconds
          revalidate: 5,
          router: appRouter,
          transformer: superjson,
        }),
      ],
    };
  },
});
