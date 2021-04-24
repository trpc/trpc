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
        url: '/api/trpc',
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
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    console.log('VERCEL_URL', process.env.VERCEL_URL);
    const trpcClient = new TRPCClient({
      url: `${baseUrl}/api/trpc`,
      getHeaders() {
        return ctx.req.headers;
      },
    });
    const queryClient = new QueryClient();

    await getDataFromTree(
      <AppTree
        pageProps={{
          ...{}, // <-- todo, get data from componenets https://hasura.io/learn/graphql/nextjs-fullstack-serverless/apollo-client/
          trpcClient,
          queryClient,
        }}
      />,
      queryClient,
    );
    const dehydratedState = trpcClient.transformer.serialize(
      dehydrate(queryClient),
    );

    console.log('dehydratedState', JSON.stringify(dehydratedState, null, 4));

    return {
      pageProps: {
        dehydratedState,
      },
    };
  };
  (MyApp as any).getInitialProps = getInitialProps;
}

export default MyApp;
