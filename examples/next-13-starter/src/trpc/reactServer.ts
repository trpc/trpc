import { createTRPCUntypedClient, httpLink } from '@trpc/client';
import { createTRPCNextAppRouterReactServer } from '@trpc/next-app-router/react-server';
import { headers } from 'next/headers';
import { cache } from 'react';
import { AppRouter } from '~/server/api/router';
import { getUrl, transformer } from './shared';

export const api = createTRPCNextAppRouterReactServer<AppRouter>({
  getClient: cache(() =>
    createTRPCUntypedClient({
      transformer,
      links: [
        (runtime) => {
          return (ctx) => {
            const { op } = ctx;
            const { path, input, type } = op;
            const tag = `${path}?input=${JSON.stringify(input)}`;

            type === 'query' && console.log('Fetching with tag', tag);

            const link = httpLink({
              url: getUrl(),
              fetch: (url, opts) => {
                return fetch(url, {
                  ...opts,
                  next: type === 'query' ? { tags: [tag] } : undefined,
                });
              },
              // FIXME: We need the headers - but server actions just breaks with them...
              // headers: async () => {
              //   const { connection: _, ...h } = Object.fromEntries(headers());
              //   return h;
              // },
            })(runtime);

            return link(ctx);
          };
        },
      ],
    }),
  ),
});
