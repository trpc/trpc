import { withTRPC } from '@trpc/next';
import { transformer } from '../utils/trpc';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
import { AppType } from 'next/dist/shared/lib/utils';
const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC({
  config() {
    return {
      transformer,
      links: [
        httpBatchLink({
          url: process.browser ? '/api/trpc' : 'http://localhost:3000/api/trpc',
        }),
      ],
    };
  },
  ssr: false,
})(MyApp);
