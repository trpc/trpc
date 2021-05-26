import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import { transformer } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(
  () => {
    return {
      url: '/api/trpc',
      transformer,
    };
  },
  {
    ssr: false,
  },
)(MyApp);
