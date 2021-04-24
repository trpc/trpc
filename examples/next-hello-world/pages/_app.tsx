import { TRPCClient } from '@trpc/client';
import { useDehydratedState } from '@trpc/react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(
    () =>
      new TRPCClient({
        url: '/api/trpc',
      }),
  );
  const hydratedState = useDehydratedState(
    trpcClient,
    pageProps.dehydratedState,
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Hydrate state={hydratedState}>
          <Component {...pageProps} />
        </Hydrate>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
export default MyApp;
