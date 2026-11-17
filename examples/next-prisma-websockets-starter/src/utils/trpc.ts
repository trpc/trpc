import type { TRPCLink } from '@trpc/client';
import {
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
  createTRPCClient,
} from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { NextComponentType, NextPageContext } from 'next';
import getConfig from 'next/config';
import type { AppRouter } from '~/server/routers/_app';
import superjson from 'superjson';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import {
  QueryClient,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import type { AppContext, AppInitialProps, AppProps } from 'next/app';
import { useState, createElement } from 'react';

// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export

const { publicRuntimeConfig } = getConfig();

const { APP_URL, WS_URL } = publicRuntimeConfig;

function getEndingLink(ctx: NextPageContext | undefined): TRPCLink<AppRouter> {
  if (typeof window === 'undefined') {
    return httpBatchLink({
      /**
       * @see https://trpc.io/docs/v11/data-transformers
       */
      transformer: superjson,
      url: `${APP_URL}/api/trpc`,
      headers() {
        if (!ctx?.req?.headers) {
          return {};
        }
        // on ssr, forward client's headers to the server
        return {
          ...ctx.req.headers,
          'x-ssr': '1',
        };
      },
    });
  }
  const client = createWSClient({
    url: WS_URL,
  });
  return wsLink({
    client,
    /**
     * @see https://trpc.io/docs/v11/data-transformers
     */
    transformer: superjson,
  });
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
function getTRPCConfig(config: { ctx?: NextPageContext }) {
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
          (process.env.NODE_ENV === 'development' &&
            typeof window !== 'undefined') ||
          (opts.direction === 'down' && opts.result instanceof Error),
      }),
      getEndingLink(config.ctx),
    ],
    /**
     * @see https://tanstack.com/query/v5/docs/reference/QueryClient
     */
    queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
  };
}

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: getTRPCConfig({}).links,
  });
}

export function makeQueryClient() {
  return new QueryClient(getTRPCConfig({}).queryClientConfig);
}

/**
 * Was `trpc.withTRPC`. Provides the tRPC and query clients to the app, and
 * hydrates the `trpcState` a page's `getStaticProps` or
 * `getServerSideProps` returns.
 */
export function withTRPC<TPageProps extends object>(
  App: NextComponentType<
    AppContext,
    AppInitialProps<TPageProps>,
    AppProps<TPageProps>
  >,
): typeof App {
  const WithTRPC: typeof App = (props) => {
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
          state:
            pageProps?.trpcState === undefined
              ? undefined
              : superjson.deserialize<DehydratedState>(
                  pageProps.trpcState as Parameters<
                    typeof superjson.deserialize
                  >[0],
                ),
          children: createElement(App, props),
        }),
      }),
    });
  };

  WithTRPC.getInitialProps = App.getInitialProps?.bind(App);
  return WithTRPC;
}

// export const transformer = superjson;
/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = RouterOutputs['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
