import {
  QueryClient as QC,
  type QueryClientConfig,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppType } from 'next/app';
import { useState, createElement } from 'react';
import type { AppRouter } from './basic.trpc';

// A config function named like an import keeps its name
function QueryClient() {
  return { links: [httpBatchLink({ url: '/api/trpc' })] };
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: QueryClient().links,
  });
}

export function makeQueryClient() {
  const config = QueryClient();

  return new QC(
    'queryClientConfig' in config
      ? (config.queryClientConfig as QueryClientConfig)
      : undefined,
  );
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

    const state = pageProps?.trpcState as DehydratedState | undefined;

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

  // Bound, as Next.js calls it on its own
  WithTRPC.getInitialProps = App.getInitialProps?.bind(App);

  return WithTRPC;
}

export const unrelated = new QC();
