import {
  QueryClient,
  QueryClientProvider,
  HydrationBoundary,
  type DehydratedState,
} from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { NextPageContext } from 'next';
import type { AppType } from 'next/app';
import { createElement, useState } from 'react';
import type { AppRouter } from './basic.trpc';

// A default value keeps the parameter, typed
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Was `config` in `createTRPCNext`. It runs in the browser, so `ctx` is
 * always undefined.
 */
function getConfig({
  ctx,
}: {
  ctx?: NextPageContext;
} = {}) {
  return { links: [httpBatchLink({ url: ctx ? '/api/trpc' : '/trpc' })] };
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
          state: pageProps?.trpcState as DehydratedState | undefined,
          children: createElement(App, props),
        }),
      }),
    });
  };

  WithTRPC.getInitialProps = App.getInitialProps;
  return WithTRPC;
}
