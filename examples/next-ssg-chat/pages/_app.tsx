import { createReactQueryHooks, createTRPCClient } from '@katt/trpc-react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { sj } from '../utils/serializer';
import type { ChatRouter, Context } from './api/trpc/[...trpc]';

export const client = createTRPCClient<ChatRouter>({
  url: '/api/trpc',
  transformers: [sj],
});

const queryClient = new QueryClient();
export const hooks = createReactQueryHooks<ChatRouter, Context>({
  client,
  queryClient,
});

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <Hydrate state={pageProps.dehydratedState}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
