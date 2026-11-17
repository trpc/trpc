import {
  httpBatchStreamLink,
  loggerLink,
  createTRPCClient,
} from '@trpc/client';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { NextPageContext } from 'next';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '~/server/routers/_app';
import { transformer } from './transformer';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import {
  QueryClient,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import type { AppType } from 'next/app';
import { useState, createElement } from 'react';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  // reference for vercel.com
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // // reference for render.com
  if (process.env.RENDER_INTERNAL_HOSTNAME) {
    return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;
  }

  // assume localhost
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

/**
 * Extend `NextPageContext` with meta data that can be picked up by `responseMeta()` when server-side rendering
 */
export interface SSRContext extends NextPageContext {
  /**
   * Set HTTP Status code
   * @example
   * const utils = trpc.useUtils();
   * if (utils.ssrContext) {
   *   utils.ssrContext.status = 404;
   * }
   */
  status?: number;
}

/**
 * A set of strongly-typed React hooks from your `AppRouter` type signature with `createReactQueryHooks`.
 * @see https://trpc.io/docs/v11/react#3-create-trpc-hooks
 */
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Was `config` in `createTRPCNext`. It runs in the browser, so `ctx` is
 * always undefined.
 */
function getConfig(config: { ctx?: NextPageContext }) {
  /**
   * If you want to use SSR, you need to use the server's full URL
   * @see https://trpc.io/docs/v11/ssr
   */
  return {
    /**
     * @see https://trpc.io/docs/v11/client/links
     */
    links: [
      // adds pretty logs to your console in development and logs errors in production
      loggerLink({
        enabled: (opts) =>
          process.env.NODE_ENV === 'development' ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchStreamLink({
        url: `${getBaseUrl()}/api/trpc`,
        /**
         * Set custom request headers on every request from tRPC
         * @see https://trpc.io/docs/v11/ssr
         */
        headers() {
          if (!config.ctx?.req?.headers) {
            return {};
          }
          // To use SSR properly, you need to forward the client's headers to the server
          // This is so you can pass through things like cookies when we're server-side rendering

          const {
            // If you're using Node 18 before 18.15.0, omit the "connection" header
            connection: _connection,
            ...headers
          } = config.ctx.req.headers;
          return headers;
        },
        /**
         * @see https://trpc.io/docs/v11/data-transformers
         */
        transformer,
      }),
    ],
    /**
     * @see https://tanstack.com/query/v5/docs/reference/QueryClient
     */
    // queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
  };
}

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: getConfig({}).links,
  });
}

export function makeQueryClient() {
  return new QueryClient();
}

/**
 * Was `trpc.withTRPC`. Provides the tRPC and query clients to the app, and
 * hydrates the `trpcState` a page's `getStaticProps` or
 * `getServerSideProps` returns.
 */
export function withTRPC<TInitialProps extends object>(
  App: AppType<TInitialProps>,
): AppType<TInitialProps> {
  const WithTRPC: AppType<TInitialProps> = (props) => {
    const [queryClient] = useState(makeQueryClient);
    const [trpcClient] = useState(makeTRPCClient);

    const pageProps = props.pageProps as
      | {
          trpcState?: unknown;
        }
      | undefined;

    return createElement(QueryClientProvider, {
      client: queryClient,

      children: createElement(TRPCProvider, {
        trpcClient,
        queryClient,

        children: createElement(HydrationBoundary, {
          state: (pageProps?.trpcState === undefined
            ? undefined
            : transformer.deserialize(
                pageProps.trpcState as Parameters<
                  typeof transformer.deserialize
                >[0],
              )) as DehydratedState | undefined,
          children: createElement(App, props),
        }),
      }),
    });
  };

  WithTRPC.getInitialProps = App.getInitialProps;
  return WithTRPC;
}

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
