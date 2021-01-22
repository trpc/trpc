import { createReactQueryHooks, createTRPCClient } from '@katt/trpc-react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ChatRouter } from './api/trpc/[...trpc]';
import { Hydrate } from 'react-query/hydration';

export const client = createTRPCClient<ChatRouter>({
  url: '/api/trpc',
});

export const hooks = createReactQueryHooks({
  client,
  queryClient: new QueryClient(),
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <QueryClientProvider client={hooks.queryClient}>
        <Hydrate state={pageProps.dehydratedState}>
          <Component {...pageProps} />
        </Hydrate>
      </QueryClientProvider>
    </>
  );
}
export default MyApp;
