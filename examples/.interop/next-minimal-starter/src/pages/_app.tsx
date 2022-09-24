import { httpBatchLink } from '@trpc/client';
import { withTRPC } from '@trpc/next';
import type { AppType } from 'next/app';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC<AppRouter>({
  config({ ctx }) {
    const url = 'http://localhost:3000/api/trpc';
    return {
      links: [
        httpBatchLink({
          url,
        }),
      ],
    };
  },
})(MyApp);
