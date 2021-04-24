import { TRPCClient } from '@trpc/client';
import { useDehydratedState, getDataFromTree } from '@trpc/react';
import {
  GetServerSidePropsContext,
  NextComponentType,
  NextPageContext,
} from 'next';
import type { AppProps /*, AppContext */ } from 'next/app';
import { AppContextType, AppTreeType } from 'next/dist/next-server/lib/utils';
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
    Component,
  }: AppContextType) => {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    console.log('VERCEL_URL', process.env.VERCEL_URL);
    const trpcClient = new TRPCClient({
      url: `${baseUrl}/api/trpc`,
      getHeaders() {
        return ctx.req?.headers ?? {};
      },
    });
    const queryClient = new QueryClient();

    let pageProps: Record<string, any> = {};
    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx);
    }

    await getDataFromTree(
      <AppTree
        pageProps={{
          ...pageProps,
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
