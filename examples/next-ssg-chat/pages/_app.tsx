import { createReactQueryHooks, createTRPCClient } from '@katt/trpc-react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { sj } from '../utils/serializer';
import type { ChatRouter } from './api/trpc/[...trpc]';
export const client = createTRPCClient<ChatRouter>({
  url: '/api/trpc',
  transformers: [sj],
});

export const hooks = createReactQueryHooks<ChatRouter>({
  client,
  queryClient: new QueryClient() as any,
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
