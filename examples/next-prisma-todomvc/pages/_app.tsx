import type { AppProps /*, AppContext */ } from 'next/app';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc, createTRPCClient } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() => createTRPCClient());
  return (
    <trpc.Provider {...{ queryClient, client }}>
      <QueryClientProvider client={queryClient}>
        <Hydrate state={trpc.useDehydratedState(pageProps.dehydratedState)}>
          <Component {...pageProps} />
        </Hydrate>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
export default MyApp;
