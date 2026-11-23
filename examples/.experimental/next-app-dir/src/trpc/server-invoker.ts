import { localLink, loggerLink, splitLink } from '@trpc/client';
import { experimental_nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { cookies } from 'next/headers';
import { auth } from '~/auth';
import { appRouter } from '~/server/routers/_app';
import { transformer } from './shared';

async function createContext() {
  return {
    session: await auth(),
    headers: {
      cookie: (await cookies()).toString(),
      'x-trpc-source': 'rsc-invoke',
    },
  };
}

/**
 * Procedures whose result depends on who's asking. The cache is shared by
 * every request, so these skip it.
 */
const perUserPaths = new Set(['me', 'secret']);

/**
 * This client invokes procedures directly on the server without fetching over HTTP.
 */
export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
        splitLink({
          condition: (op) => perUserPaths.has(op.path),
          true: localLink({
            router: appRouter,
            transformer,
            createContext,
          }),
          false: experimental_nextCacheLink({
            // requests are cached for 5 seconds
            revalidate: 5,
            router: appRouter,
            transformer,
            createContext,
          }),
        }),
      ],
    };
  },
});
