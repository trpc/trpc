import { httpBatchLink, loggerLink } from '@trpc/client';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import type { AppRouter } from '~/server/routers/_app';
import { cookies } from 'next/headers';
import superjson from 'superjson';
import { getUrl } from './shared';
import { createContext } from './shared-server';

export const api = experimental_createTRPCNextAppDirServer<AppRouter>({
  createContext,
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        httpBatchLink({
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
