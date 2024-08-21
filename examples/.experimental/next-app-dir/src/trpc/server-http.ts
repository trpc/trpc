import { loggerLink } from '@trpc/client';
import { experimental_nextHttpLink } from '@trpc/next/app-dir/links/nextHttp';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import type { AppRouter } from '~/server/routers/_app';
import { cookies } from 'next/headers';
import { getUrl, transformer } from './shared';

export const api = experimental_createTRPCNextAppDirServer<AppRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        experimental_nextHttpLink({
          batch: true,
          url: getUrl(),
          transformer,
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
