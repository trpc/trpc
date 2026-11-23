import {
  QueryClient,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppType } from 'next/app';
import { useState, createElement } from 'react';
import state from 'superjson';
import type { AppRouter } from './basic.trpc';

// The hoisted transformer avoids a name the file already uses
export const hydrationTransformer = 'taken';

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Was `config` in `createTRPCNext`. `withTRPC` calls it once per mount,
 * on the server and in the browser, without `ctx`.
 */
function getConfig() {
  return { links: [httpBatchLink({ url: '/api/trpc', transformer: state })] };
}

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: getConfig().links,
  });
}

export function makeQueryClient() {
  return new QueryClient();
}

const hydrationTransformer2 = state;

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

    const state: DehydratedState | undefined = !pageProps?.trpcState
      ? undefined
      : hydrationTransformer2.deserialize(
          pageProps.trpcState as Parameters<
            typeof hydrationTransformer2.deserialize
          >[0],
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
