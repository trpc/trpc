import { httpBatchStreamLink, loggerLink } from '@trpc/client';
import type { NextPage } from 'next';
import type { AppProps, AppType } from 'next/app';
import type { ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';
import { FateClient as FateClientProvider } from 'react-fate';

import { DefaultLayout } from '~/components/DefaultLayout';
import { createFateClient, getBaseUrl } from '~/utils/fate';
import { transformer } from '~/utils/transformer';
import '~/styles/globals.css';

export type NextPageWithLayout<
  TProps = Record<string, unknown>,
  TInitialProps = TProps,
> = NextPage<TProps, TInitialProps> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const MyApp = (({ Component, pageProps }: AppPropsWithLayout) => {
  const fate = useMemo(
    () =>
      createFateClient({
        links: [
          loggerLink({
            enabled: (opts) =>
              process.env.NODE_ENV === 'development' ||
              (opts.direction === 'down' && opts.result instanceof Error),
          }),
          httpBatchStreamLink({
            url: `${getBaseUrl()}/api/trpc`,
            headers() {
              return {};
            },
            transformer,
          }),
        ],
      }),
    [],
  );
  const getLayout =
    Component.getLayout ?? ((page) => <DefaultLayout>{page}</DefaultLayout>);

  return (
    <FateClientProvider client={fate}>
      {getLayout(<Component {...pageProps} />)}
    </FateClientProvider>
  );
}) as AppType;

export default MyApp;
