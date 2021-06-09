import { withTRPC } from '@trpc/next';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { loggerLink } from '@trpc/client/links/loggerLink';
import { AppType } from 'next/dist/next-server/lib/utils';
import Link from 'next/link';
// import { transformer } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <>
      <nav>
        <Link href="/">
          <a>Index</a>
        </Link>{' '}
        <Link href="/batching">
          <a>Batching</a>
        </Link>
      </nav>
      <Component {...pageProps} />
    </>
  );
};

function getBaseUrl() {
  if (process.browser) {
    return '';
  }
  // // reference for vercel.com
  // if (process.env.VERCEL_URL) {
  //   return process.env.VERCEL_URL;
  // }

  // // reference for render.com
  // if (process.env.RENDER_INTERNAL_HOSTNAME) {
  //   return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;
  // }

  // assume localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export default withTRPC(
  () => {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */
    return {
      links: [
        loggerLink({
          enabled: ({ event }) =>
            process.env.NODE_ENV === 'development' || event === 'error',
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
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
  {
    /**
     * @link https://trpc.io/docs/ssr
     */
    ssr: false,
  },
)(MyApp);
