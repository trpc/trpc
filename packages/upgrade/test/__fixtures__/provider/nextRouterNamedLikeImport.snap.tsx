import {
  QueryClient as QC,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppType } from 'next/app';
import { useState, createElement } from 'react';
import type { AppRouter as QueryClient } from './basic.trpc';

// A router type named like an import keeps its name
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<QueryClient>();

/**
 * Was `config` in `createTRPCNext`. It runs in the browser, so `ctx` is
 * always undefined.
 */
function getConfig() {
  return { links: [httpBatchLink({ url: '/api/trpc' })] };
}

export function makeTRPCClient() {
  return createTRPCClient<QueryClient>({
    links: getConfig().links,
  });
}

export function makeQueryClient() {
  return new QC();
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

export const unrelated = new QC();
