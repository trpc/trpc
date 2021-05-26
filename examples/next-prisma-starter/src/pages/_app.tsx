import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
// import { transformer } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(
  () => {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */
    return {
      url: '/api/trpc',
      /**
       * @link https://trpc.io/docs/data-transformers
       */
      // transformer,
    };
  },
  {
    /**
     * @link https://trpc.io/docs/ssr
     */
    // ssr: true,
  },
)(MyApp);
