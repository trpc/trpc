import type { AppProps } from 'next/app';
import { QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={trpc.queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
