import { createReactQueryHooks, createTRPCClient } from '@katt/trpc-react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import superjson from 'superjson';
import { ChatRouter } from './api/trpc/[...trpc]';
export const client = createTRPCClient<ChatRouter>({
  url: '/api/trpc',
  transformers: [superjson],
});

export const hooks = createReactQueryHooks({
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
