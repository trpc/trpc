import '../styles/global.css';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
} from '@trpc/client';
import { SessionProvider } from 'next-auth/react';
import App, { type AppContext, type AppProps } from 'next/app';
import getConfig from 'next/config';
import { useState } from 'react';
import superjson from 'superjson';
import type { AppRouter } from '~/server/routers/_app';
import { makeQueryClient } from '~/utils/query-client';
import { TRPCProvider } from '~/utils/trpc';
import type { TRPCState } from '~/utils/use-trpc-state';
import { useTRPCState } from '~/utils/use-trpc-state';

const { publicRuntimeConfig } = getConfig();

const { APP_URL, WS_URL } = publicRuntimeConfig;

function getEndingLink() {
  if (typeof window === 'undefined') {
    /**
     * `_app` also renders on the server, where nothing calls the API: pages
     * prefetch in `getServerSideProps` and subscriptions start in the browser
     */
    return httpBatchLink<AppRouter>({
      /**
       * @see https://trpc.io/docs/v11/data-transformers
       */
      transformer: superjson,
      url: `${APP_URL}/api/trpc`,
    });
  }
  const client = createWSClient({
    url: WS_URL,
  });
  return wsLink<AppRouter>({
    client,
    /**
     * @see https://trpc.io/docs/v11/data-transformers
     */
    transformer: superjson,
  });
}

type PageProps = { trpcState?: TRPCState };

/**
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#6-configure-_apptsx
 */
function MyApp({ Component, pageProps }: AppProps<PageProps>) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      /**
       * @see https://trpc.io/docs/v11/client/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            (process.env.NODE_ENV === 'development' &&
              typeof window !== 'undefined') ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        getEndingLink(),
      ],
    }),
  );
  const trpcState = useTRPCState(pageProps.trpcState);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <HydrationBoundary state={trpcState}>
          <SessionProvider>
            <Component {...pageProps} />
          </SessionProvider>
        </HydrationBoundary>
      </TRPCProvider>
    </QueryClientProvider>
  );
}

/**
 * `publicRuntimeConfig` only reaches pages rendered on each request, so this
 * opts every page out of static optimization
 * @see https://nextjs.org/docs/pages/api-reference/config/next-config-js/runtime-configuration
 */
MyApp.getInitialProps = (appContext: AppContext) =>
  App.getInitialProps(appContext);

export default MyApp;
