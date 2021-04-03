import { useInstance } from '@trpc/react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  const queryClient = useInstance(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={trpc.useDehydratedState(pageProps.dehydratedState)}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
