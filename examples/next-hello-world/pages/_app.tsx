import { TRPCClient } from '@trpc/client';
import { useDehydratedState, getDataFromTree } from '@trpc/react';
import { GetServerSidePropsContext } from 'next';
import type { AppProps /*, AppContext */ } from 'next/app';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dehydrate, Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(
    () => pageProps.queryClient ?? new QueryClient(),
  );
  const [trpcClient] = useState(
    () =>
      pageProps.trpcClient ??
      new TRPCClient({
        url: process.browser ? '/api/trpc' : 'http://localhost:3000/api/trpc',
      }),
  );
  const hydratedState = useDehydratedState(
    trpcClient,
    pageProps.dehydratedState,
  );
  return (
    <trpc.Provider
      client={trpcClient}
      queryClient={queryClient}
      ssr={!process.browser}
    >
      <QueryClientProvider client={queryClient}>
        <Hydrate state={hydratedState}>
          <Component {...pageProps} />
        </Hydrate>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

if (!process.browser) {
  const getInitialProps = async ({
    ctx,
    AppTree,
  }: {
    ctx: GetServerSidePropsContext;
    AppTree: any;
  }) => {
    const trpcClient = new TRPCClient({
      url: 'http://localhost:3000/api/trpc',
      getHeaders() {
        return {};
      },
    });
    const queryClient = new QueryClient();

    await getDataFromTree(
      <AppTree
        pageProps={{
          ...{},
          trpcClient,
          queryClient,
        }}
      />,
      queryClient,
    );
    const dehydratedState = trpcClient.transformer.serialize(
      dehydrate(queryClient),
    );

    return {
      pageProps: {
        dehydratedState,
      },
    };
  };
  (MyApp as any).getInitialProps = getInitialProps;
}

export default MyApp;
