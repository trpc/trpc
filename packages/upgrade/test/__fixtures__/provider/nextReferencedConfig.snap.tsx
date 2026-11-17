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
import superjson from 'superjson';
import type { AppRouter } from './basic.trpc';

function getTransformer() {
  return superjson;
}

function clientConfig() {
  return {
    links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
  };
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: clientConfig().links,
  });
}

export function makeQueryClient() {
  const config = clientConfig();

  return new QueryClient(
    'queryClientConfig' in config
      ? (config.queryClientConfig as QueryClientConfig)
      : undefined,
  );
}

const hydrationTransformer = getTransformer();

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
            : hydrationTransformer.deserialize(
                pageProps.trpcState as Parameters<
                  typeof hydrationTransformer.deserialize
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
