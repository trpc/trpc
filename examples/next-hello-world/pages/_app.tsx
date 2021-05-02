import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import React from 'react';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

MyApp.getInitialProps = async ({ ctx }) => {
  // make it sloow
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    pageProps: {},
  };
};

export default withTRPC<AppRouter>(
  ({ ctx }) => {
    if (process.browser) {
      return {
        url: '/api/trpc',
        getHeaders() {
          // optional:
          // send some headers that are only sent from the client
          return {
            'x-ssr': '0',
          };
        },
      };
    }

    const ONE_DAY_SECONDS = 60 * 60 * 24;
    ctx?.res?.setHeader(
      'Cache-Control',
      `s-maxage=1, stale-while-revalidate=${ONE_DAY_SECONDS}`,
    );
    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      url,
      getHeaders() {
        // optional:
        // send some headers that are only sent from the server
        return {
          'x-ssr': '1',
        };
      },
    };
  },
  { ssr: true },
)(MyApp);
