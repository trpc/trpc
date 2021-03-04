import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={trpc.queryClient}>
      <Hydrate state={trpc.useDehydratedState(pageProps.dehydratedState)}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
