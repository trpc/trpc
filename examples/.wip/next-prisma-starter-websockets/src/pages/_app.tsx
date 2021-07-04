import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { wsLink, createWSClient } from '@trpc/client/links/wsLink';
import { loggerLink } from '@trpc/client/links/loggerLink';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import type { AppRouter } from 'server/routers/app';
// import { transformer } from '../utils/trpc';
import getConfig from 'next/config';
const { publicRuntimeConfig } = getConfig();

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <>
      <Component {...pageProps} />
    </>
  );
};

function getEndingLink() {
  const { APP_URL } = publicRuntimeConfig;
  if (!process.browser) {
    return httpBatchLink({
      url: `${APP_URL}/api/trpc`,
    });
  }
  const client = createWSClient({
    url: APP_URL.replace(/^http/, 'ws'),
  });
  return wsLink<AppRouter>({
    client,
  });
}

export default withTRPC<AppRouter>({
  config() {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */

    return {
      /**
       * @link https://trpc.io/docs/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            (process.env.NODE_ENV === 'development' && process.browser) ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        getEndingLink(),
      ],
      /**
       * @link https://trpc.io/docs/data-transformers
       */
      // transformer,
      /**
       * @link https://react-query.tanstack.com/reference/QueryClient
       */
      queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  /**
   * @link https://trpc.io/docs/ssr
   */
  ssr: false,
})(MyApp);
