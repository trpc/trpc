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

const shared = { queryClientConfig: { defaultOptions: {} } };
const urls = { QueryClient: '/api/trpc' };

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Was `config` in `createTRPCNext`. `withTRPC` calls it once per mount,
 * on the server and in the browser, without `ctx`.
 */
function getConfig() {
  // Property names that match an import stay as they are
  const { QueryClient: url } = urls;
  return {
    links: [httpBatchLink({ url: urls.QueryClient ?? url })],
    ...shared,
  };
}

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: getConfig().links,
  });
}

export function makeQueryClient() {
  const config = getConfig();

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

  // Bound, as Next.js calls it on its own
  WithTRPC.getInitialProps = App.getInitialProps?.bind(App);

  return WithTRPC;
}

export const unrelated = new QC();
