'use server';

import { httpBatchLink, loggerLink } from '@trpc/client';
import {
  experimental_createServerActionHandler,
  experimental_createTRPCNextAppDirServer,
} from '@trpc/next/app-dir/server';
import { appRouter } from '~/server/routers/_app';
import { cookies } from 'next/headers';
import superjson from 'superjson';
import { getUrl } from './shared';

export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        httpBatchLink({
          url: getUrl(),
          headers() {
            return {
              cookie: cookies().toString(),
              'x-trpc-source': 'rsc',
            };
          },
        }),
      ],
    };
  },
});

export const createAction = experimental_createServerActionHandler({
  router: appRouter,
  createContext() {
    return {
      headers: {
        cookie: cookies().toString(),
        'x-trpc-source': 'server-action',
      },
    };
  },
});
