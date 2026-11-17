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

// A config function called `config` stays callable in `makeQueryClient`
function config() {
  return { links: [httpBatchLink({ url: '/api/trpc' })] };
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export function makeTRPCClient(config2 = config()) {
  return createTRPCClient<AppRouter>({
    links: config2.links,
  });
}

export function makeQueryClient(config2 = config()) {
  return new QueryClient(
    'queryClientConfig' in config2
      ? (config2.queryClientConfig as QueryClientConfig)
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
      const config2 = config();

      return {
        queryClient: makeQueryClient(config2),
        trpcClient: makeTRPCClient(config2),
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
