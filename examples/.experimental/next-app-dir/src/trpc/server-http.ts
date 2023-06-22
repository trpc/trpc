'use server';

import { loggerLink } from '@trpc/client';
import { experimental_nextHttpLink } from '@trpc/next/app-dir/links/nextHttp';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { AppRouter } from '~/server/routers/_app';
import { headers } from 'next/headers';
import superjson from 'superjson';
import { getUrl } from './shared';

export const api = experimental_createTRPCNextAppDirServer<AppRouter>({
  config() {
    return {
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        experimental_nextHttpLink({
          revalidate: 2,
          batch: true,
          url: getUrl(),
          headers() {
            return {
              cookie: headers().get('cookie') ?? '',
            };
          },
        }),
      ],
    };
  },
});

// export const createAction =
