import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { AppType } from 'next/app';
import { trpc } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <>
      <Component {...pageProps} />;
    </>
  );
};

export default trpc.withTRPC(MyApp);
