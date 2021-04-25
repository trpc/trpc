import { withTRPCClient } from '@trpc/next';
import type { AppProps /*, AppContext */ } from 'next/app';
import { trpcClientOptions } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
export default withTRPCClient(
  () => {
    return { ...trpcClientOptions };
  },
  {
    ssr: false,
  },
)(MyApp);
