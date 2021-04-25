import { withTRPC } from '@trpc/next';
import type { AppProps /*, AppContext */ } from 'next/app';
import { transformer } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
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
