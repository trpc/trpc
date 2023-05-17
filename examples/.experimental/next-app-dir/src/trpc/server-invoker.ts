'use server';

import { loggerLink } from '@trpc/client';
import { nextCacheLink } from '@trpc/next/app-dir/links/nextCache';
import { experimental_createTRPCNextAppDirServer } from '@trpc/next/app-dir/server';
import { headers } from 'next/headers';
import { appRouter } from '~/server/routers/_app';

export const api = experimental_createTRPCNextAppDirServer<typeof appRouter>({
  config() {
    return {
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        nextCacheLink({
          router: appRouter,
          createContext: async () => {
            const h = Object.fromEntries(headers().entries());
            return { headers: h };
          },
        }),
      ],
    };
  },
});
