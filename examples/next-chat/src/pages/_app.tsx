import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import { transformer } from '../utils/trpc';
import { httpBatchLink } from '@trpc/client/links/httpBatchLink';
const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(
  () => {
    return {
      transformer,
      links: [
        httpBatchLink({
          url: '/api/trpc',
        }),
      ],
    };
  },
  {
    ssr: false,
  },
)(MyApp);
