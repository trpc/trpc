import type { DehydratedState } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import type { AppRouter } from '~/server/routers/_app';
import { makeQueryClient } from '../utils/query-client';
import { TRPCProvider } from '../utils/trpc';

export default function App({
  Component,
  pageProps,
}: AppProps<{ trpcState?: DehydratedState }>) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          // The client only calls the API from the browser
          url: '/api/trpc',
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <HydrationBoundary state={pageProps.trpcState}>
          <Component {...pageProps} />
        </HydrationBoundary>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
