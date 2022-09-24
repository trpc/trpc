import { httpBatchLink } from '@trpc/client';
import { withTRPC } from '@trpc/next';
import type { AppType } from 'next/app';
import { transformer } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC({
  config() {
    return {
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
      transformer,
    };
  },
  ssr: false,
})(MyApp);
