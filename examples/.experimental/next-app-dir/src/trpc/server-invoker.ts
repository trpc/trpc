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
      /**
       * Using the `contextSelector` property we can select the specific values to be included
       * in the `cacheTag` generation.
       *
       * In the following example, if the requests' path doesn't have `privateGreeting` in it
       * (which is a private route that uses some values from the context), we return an empty array
       * meaning that we don't use any values from the context in other routes.
       * On the other side if it has `privateGreeting`, we specify the values from the context that we use
       * in the `privateGreeting` procedure.
       */
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
