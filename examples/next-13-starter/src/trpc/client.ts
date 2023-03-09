import { httpBatchLink, httpLink, loggerLink, splitLink } from '@trpc/client';
import { createTRPCNextAppRouterClient } from '@trpc/next-app-router/client';
import superjson from 'superjson';
import { AppRouter } from '~/server/router';
import { getUrl } from './shared';

export const api = createTRPCNextAppRouterClient<AppRouter>({
  config() {
    return {
      transformer: superjson,
      links: [
        loggerLink(),
        splitLink({
          condition: (op) => !!op.context.skipBatch,
          true: httpLink({
            url: getUrl(),
            fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
          }),
          false: httpBatchLink({
            url: getUrl(),
            fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
          }),
        }),
      ],
    };
  },
});
