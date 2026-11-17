import '../styles/global.css';
import type { DehydratedState } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, loggerLink } from '@trpc/client';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import type { AppRouter } from '~/server/routers/_app';
import { makeQueryClient } from '~/utils/query-client';
import { getEndingLink, TRPCProvider } from '~/utils/trpc';

export default function App({
  Component,
  pageProps,
}: AppProps<{ trpcState?: DehydratedState }>) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [loggerLink({ enabled: () => true }), getEndingLink()],
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
