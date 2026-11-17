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

export function makeTRPCClient(config = getConfig()) {
  return createTRPCClient<AppRouter>({
    links: config.links,
  });
}

export function makeQueryClient(config = getConfig()) {
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
    const [{ queryClient, trpcClient }] = useState(() => {
      const config = getConfig();

      return {
        queryClient: makeQueryClient(config),
        trpcClient: makeTRPCClient(config),
      };
    });

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

export const unrelated = new QC();
