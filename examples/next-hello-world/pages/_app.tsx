import { withTRPCClient } from '@trpc/react/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import React from 'react';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

MyApp.getInitialProps = async ({ ctx }) => {
  // make it sloow
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const ONE_DAY_SECONDS = 60 * 60 * 24;
  ctx.res?.setHeader(
    'Cache-Control',
    `s-maxage=1, stale-while-revalidate=${ONE_DAY_SECONDS}`,
  );
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

console.log('url', url);
export default withTRPCClient<AppRouter>(MyApp, {
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
