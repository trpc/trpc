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
        (runtime) => {
          return (ctx) => {
            const { op } = ctx;
            const { path } = op;

            const link = httpLink({
              url: getUrl(),
              fetch: (url, opts) => {
                return fetch(url, {
                  ...opts,
                  next: { tags: [path] },
                });
              },
            })(runtime);

            return link(ctx);
          };
        },
      ],
    };
  },
});
