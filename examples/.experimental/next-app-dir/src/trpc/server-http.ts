import { loggerLink } from '@trpc/client';
import { experimental_nextHttpLink } from '@trpc/next/app-dir/links/nextHttp';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import type { AppRouter } from '~/server/routers/_app';
import { cookies } from 'next/headers';
import superjson from 'superjson';
import { getUrl } from './shared';
import { createContext } from './shared-server';

export const api = experimental_createTRPCNextAppDirServer<AppRouter>({
  config() {
    return {
      createContext: () => createContext('http'),
      cacheContext: (ctx) => [ctx.session?.user.id],
      links: [
        loggerLink({
          enabled: (_op) => true,
        }),
        experimental_nextHttpLink({
          batch: true,
          url: getUrl(),
          transformer: superjson,
          headers() {
            return {
              cookie: cookies().toString(),
              'x-trpc-source': 'rsc-http',
            };
          },
        }),
      ],
    };
  },
});

// export const createAction =
