'use client';

import { httpBatchLink, loggerLink } from '@trpc/client';
import {
  experimental_createActionHook,
  experimental_createTRPCNextAppDirClient,
  experimental_serverActionLink,
} from '@trpc/next/app-dir/client';
import superjson from 'superjson';
import { AppRouter } from '~/server/routers/_app';
import { getUrl } from './shared';

export const api = experimental_createTRPCNextAppDirClient<AppRouter>({
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
              'x-trpc-source': 'client',
            };
          },
        }),
      ],
    };
  },
});

export const useAction = experimental_createActionHook({
  links: [loggerLink(), experimental_serverActionLink()],
  transformer: superjson,
});
