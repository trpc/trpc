import { withTRPCClient } from '@trpc/react';
import type { AppProps /*, AppContext */ } from 'next/app';
import { trpcClientOptions } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
export default withTRPCClient(MyApp, { ...trpcClientOptions, ssr: false });
