import { TRPCClient } from '@trpc/client';
import { getDataFromTree } from '@trpc/react';
import type { Dict } from '@trpc/server';
import type { AppProps /*, AppContext */ } from 'next/app';
import { AppContextType, AppType } from 'next/dist/next-server/lib/utils';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dehydrate, Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';
import { withTRPCClient } from '../utils/withTRPCClient';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

MyApp.getInitialProps = async ({ ctx }) => {
  // make it sloow
  // await new Promise((resolve) => setTimeout(resolve, 1000));

  // ctx.res?.setHeader('Vary', 'Authorization');
  ctx.res?.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=600');
  return {
    pageProps: {},
  };
};
const baseUrl = process.browser
  ? ''
  : process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

const url = `${baseUrl}/api/trpc`;

export default withTRPCClient(MyApp, {
  url,
  ssr: true,
  getHeaders() {
    if (process.browser) {
      return {};
    }
    return {
      'x-ssr': '1',
    };
  },
});
