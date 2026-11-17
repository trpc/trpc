import {
  QueryClient,
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

// `config` may open a WebSocket, so `withTRPC` must call it once per mount,
// even when the codemod can't see whether it returns `queryClientConfig`
export const configCalls = { count: 0 };

const clientConfig = () => {
  configCalls.count++;
  return { links: [httpBatchLink({ url: 'http://localhost/api/trpc' })] };
};

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export function makeTRPCClient(config = clientConfig()) {
  return createTRPCClient<AppRouter>({
    links: config.links,
  });
}

export function makeQueryClient(config = clientConfig()) {
  return new QueryClient(
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
      const config = clientConfig();

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
