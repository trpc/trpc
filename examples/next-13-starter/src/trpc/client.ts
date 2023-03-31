import { httpBatchLink, httpLink, loggerLink, splitLink } from '@trpc/client';
import { createTRPCNextAppRouterClient } from '@trpc/next-app-router/client';
import { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
// import { headers } from 'next/headers';
import { AppRouter } from '~/server/api/router';
import { getUrl, transformer } from './shared';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

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
            // headers: () => {
            //   const { connection: _, ...h } = Object.fromEntries(
            //     Object.entries(headers() || {}),
            //   );
            //   return h;
            // },
          }),
          false: httpBatchLink({
            url: getUrl(),
            // fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
            // headers: () => {
            //   const { connection: _, ...h } = Object.fromEntries(
            //     Object.entries(headers() || {}),
            //   );
            //   return h;
            // },
          }),
        }),
      ],
    };
  },
});
