import { httpBatchLink } from '@trpc/client';
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/shared/lib/utils';
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
