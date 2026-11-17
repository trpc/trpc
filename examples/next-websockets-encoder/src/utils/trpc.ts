import {
  QueryClient,
  type DehydratedState,
  QueryClientProvider,
  HydrationBoundary,
} from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import {
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
  createTRPCClient,
} from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { NextPageContext } from 'next';
import type { AppType } from 'next/app';
import { useState, createElement } from 'react';
import type { AppRouter } from '~/server/routers/_app';
import { msgpackEncoder } from './encoder';

const WS_URL = 'ws://localhost:3001';
const APP_URL = 'http://localhost:3000';

function getEndingLink(ctx: NextPageContext | undefined): TRPCLink<AppRouter> {
  if (typeof window === 'undefined') {
    return httpBatchLink({
      url: `${APP_URL}/api/trpc`,
      headers() {
        if (!ctx?.req?.headers) {
          return {};
        }
        return { ...ctx.req.headers, 'x-ssr': '1' };
      },
    });
  }

  const client = createWSClient({
    url: WS_URL,
    experimental_encoder: msgpackEncoder,
  });

  return wsLink({ client });
}

// TODO(@trpc/upgrade): createTRPCNext had `ssr: true`, which has no replacement. Prefetch each page's queries in `getServerSideProps` instead, see https://trpc.io/docs/client/nextjs/pages-router/ssr
export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/**
 * Was `config` in `createTRPCNext`. It runs in the browser, so `ctx` is
 * always undefined.
 */
function getConfig({ ctx }: { ctx?: NextPageContext }) {
  return {
    links: [loggerLink({ enabled: () => true }), getEndingLink(ctx)],
  };
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
