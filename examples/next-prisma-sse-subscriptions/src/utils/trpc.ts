import type { TRPCLink } from '@trpc/client';
import {
  httpBatchLink,
  loggerLink,
  splitLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import type { inferRouterOutputs } from '@trpc/server';
import type { NextPageContext } from 'next';
import getConfig from 'next/config';
import type { AppRouter } from '~/server/routers/_app';
import superjson from 'superjson';

// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export

const { publicRuntimeConfig } = getConfig();

const { APP_URL } = publicRuntimeConfig;

const BASE_URL = typeof window === 'undefined' ? APP_URL : '';

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createReactQueryHooks`.
 * @link https://trpc.io/docs/v11/react#3-create-trpc-hooks
 */
export const trpc = createTRPCNext<AppRouter>({
  /**
   * @link https://trpc.io/docs/v11/ssr
   */
  ssr: true,
  ssrPrepass,
  config({ ctx }) {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/v11/ssr
     */

    return {
      /**
       * @link https://trpc.io/docs/v11/client/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink(),
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: unstable_httpSubscriptionLink({
            url: `${BASE_URL}/api/trpc`,
            /**
             * @link https://trpc.io/docs/v11/data-transformers
             */
            transformer: superjson,
          }),
          false: httpBatchLink({
            url: `${BASE_URL}/api/trpc`,
            /**
             * @link https://trpc.io/docs/v11/data-transformers
             */
            transformer: superjson,
          }),
        }),
      ],
      /**
       * @link https://tanstack.com/query/v5/docs/reference/QueryClient
       */
      queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  /**
   * @link https://trpc.io/docs/v11/data-transformers
   */
  transformer: superjson,
});

// export const transformer = superjson;
/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = RouterOutputs['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
