import { httpBatchLink, httpLink, loggerLink, splitLink } from '@trpc/client';
import { createTRPCNextAppRouterClient } from '@trpc/next-app-router/client';
import { AppRouter } from '~/server/api/router';
import { getUrl, transformer } from './shared';

export const api = createTRPCNextAppRouterClient<AppRouter>({
  config() {
    return {
      transformer,
      links: [
        loggerLink(),
        splitLink({
          condition: (op) => !!op.context.skipBatch,
          true: httpLink({
            url: getUrl(),
            // fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
          }),
          false: httpBatchLink({
            url: getUrl(),
            // fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
          }),
        }),
      ],
    };
  },
});
