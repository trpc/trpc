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
          batch: false,
          url: getUrl(),
          headers() {
            const newHeaders = new Map(headers());

            // If you're using Node 18 before 18.15.0, omit the "connection" header
            newHeaders.delete('connection');

            // `x-trpc-source` is not required, but can be useful for debugging
            newHeaders.set('x-trpc-source', 'rsc-http');

            // Forward headers from the browser to the API
            return Object.fromEntries(newHeaders);
          },
        }),
      ],
    };
  },
});

// export const createAction =
