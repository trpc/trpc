import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers/_app';
import { makeQueryClient } from '../utils/query-client';
import { TRPCProvider } from '../utils/trpc';
import type { TRPCState } from '../utils/use-trpc-state';
import { useTRPCState } from '../utils/use-trpc-state';

/**
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#6-configure-_apptsx
 */
export default function MyApp({
  Component,
  pageProps,
}: AppProps<{ trpcState?: TRPCState }>) {
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
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchLink({
          // The client only calls the API from the browser
          url: '/api/trpc',
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer: superjson,
        }),
      ],
    }),
  );
  const trpcState = useTRPCState(pageProps.trpcState);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <HydrationBoundary state={trpcState}>
          <Component {...pageProps} />
        </HydrationBoundary>
      </TRPCProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
