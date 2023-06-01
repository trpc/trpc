'use server';

import { loggerLink } from '@trpc/client';
import { experimental_nextHttpLink } from '@trpc/next/app-dir/links/nextHttp';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
// import { headers } from 'next/headers';
import { AppRouter } from '~/server/routers/_app';
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
          batch: false,
          url: getUrl(),
          headers() {
            // Forward headers from the browser to the API
            return {
              // ...Object.fromEntries(headers()),
              'x-trpc-source': 'rsc',
            };
          },
        }),
      ],
    };
  },
});

// export const createAction =
