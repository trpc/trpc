import type { DehydratedState } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import { makeQueryClient } from '../utils/query-client';
import { TRPCProvider } from '../utils/trpc';
import type { AppRouter } from './api/trpc/[trpc]';

export default function App({
  Component,
  pageProps,
}: AppProps<{ trpcState?: DehydratedState }>) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
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
