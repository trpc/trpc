import {
  QueryClient,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { NextPageContext } from 'next';
import type { AppType } from 'next/app';
import { useState, createElement } from 'react';
import superjson from 'superjson';
import type { AppRouter } from './basic.trpc';

/**
 * The hooks for the app
 */
// TODO(@trpc/upgrade): createTRPCNext had `ssr: true`, which has no replacement. Prefetch each page's queries in `getServerSideProps` instead, see https://trpc.io/docs/client/nextjs/pages-router/ssr
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Was `config` in `createTRPCNext`. `withTRPC` calls it once per mount,
 * on the server and in the browser, without `ctx`.
 */
function getConfig(opts: { ctx?: NextPageContext }) {
  return {
    links: [
      httpBatchLink({
        url: '/api/trpc',
        transformer: superjson,
        headers: () => opts.ctx?.req?.headers ?? {},
      }),
    ],
    queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
  };
}

export function makeTRPCClient(config = getConfig({})) {
  return createTRPCClient<AppRouter>({
    links: config.links,
  });
}

export function makeQueryClient(config = getConfig({})) {
  return new QueryClient(config.queryClientConfig);
}

function makeClients() {
  const config = getConfig({});

  return {
    queryClient: makeQueryClient(config),
    trpcClient: makeTRPCClient(config),
  };
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
    const [{ queryClient, trpcClient }] = useState(makeClients);

    const pageProps = props.pageProps as
      | {
          trpcState?: unknown;
        }
      | undefined;

    const state: DehydratedState | undefined = !pageProps?.trpcState
      ? undefined
      : superjson.deserialize(
          pageProps.trpcState as Parameters<typeof superjson.deserialize>[0],
        );

    return createElement(QueryClientProvider, {
      client: queryClient,

      children: createElement(TRPCProvider, {
        trpcClient,
        queryClient,

        children: createElement(HydrationBoundary, {
          state,
          children: createElement(App, props),
        }),
      }),
    });
  };

  const appGetInitialProps = App.getInitialProps?.bind(App);

  if (appGetInitialProps) {
    // Like classic `withTRPC`: Next.js gets `{ pageProps }`, never `undefined`
    WithTRPC.getInitialProps = async (ctx) => {
      const initialProps = (await appGetInitialProps(ctx)) as {
        pageProps?: unknown;
      };

      return {
        pageProps: initialProps.pageProps ?? {},
      } as unknown as TInitialProps;
    };
  }

  return WithTRPC;
}
