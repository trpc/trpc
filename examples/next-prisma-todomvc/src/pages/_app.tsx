import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { AppProps } from 'next/app';
import { withTRPC } from '../utils/trpc';

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Component {...pageProps} />
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  );
};

export default withTRPC(MyApp);
