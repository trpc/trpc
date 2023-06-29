'use server';

import { loggerLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import {
  experimental_createServerActionHandler,
  experimental_createTRPCNextAppDirServer,
} from '@trpc/next/app-dir/server';
import { auth } from '~/auth';
import { appRouter } from '~/server/routers/_app';
import { cookies } from 'next/headers';
import SuperJSON from 'superjson';

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      transformer: SuperJSON,
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        experimental_nextCacheLink({
          // requests are cached for 5 seconds
          revalidate: 5,
          router: appRouter,
          async createContext() {
            return {
              session: await auth(),
              headers: {
                cookie: cookies().toString(),
                'x-trpc-source': 'rsc-invoke',
              },
            };
          },
        }),
      ],
    };
  },
});

export const createAction = experimental_createServerActionHandler({
  router: appRouter,
  async createContext() {
    return {
      session: await auth(),
      headers: {
        cookie: cookies().toString(),
        'x-trpc-source': 'server-action',
      },
    };
  },
});
