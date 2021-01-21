import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClientProvider } from 'react-query';
import { ChatRouter } from './api/trpc/[...trpc]';
import { Hydrate } from 'react-query/hydration';

const client = createTRPCClient<ChatRouter>({
  url: '/api/trpc',
});

export const hooks = createReactQueryHooks({ client });

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <QueryClientProvider client={hooks.queryClient as any}>
        <Hydrate state={pageProps.dehydratedState}>
          <Component {...pageProps} />
        </Hydrate>
      </QueryClientProvider>
    </>
  );
}
export default MyApp;
