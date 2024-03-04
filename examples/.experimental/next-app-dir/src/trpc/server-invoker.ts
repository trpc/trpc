import { loggerLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { auth } from '~/auth';
import { appRouter } from '~/server/routers/_app';
import { cookies, headers } from 'next/headers';
import superjson from 'superjson';

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      createContext: async () => ({
        session: await auth(),
        // Mock user id which is used for testing. If you copy this file, delete the next property.
        _userIdMock: headers().get('x-trpc-user-id'),
        headers: {
          cookie: cookies().toString(),
          'x-trpc-source': 'rsc-invoke',
        },
      }),
      cacheContext: (ctx) => [ctx.session?.user.id, ctx._userIdMock],
      links: [
        loggerLink({
          enabled: (op) => true,
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
