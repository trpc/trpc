import type { NextPage } from 'next';
import type { AppType, AppProps } from 'next/app';
import type { ReactElement, ReactNode } from 'react';

import { DefaultLayout } from '~/components/DefaultLayout';
import { createLinks, TRPCProvider } from '~/utils/trpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '~/styles/globals.css';
import { createTRPCClient } from '@trpc/client';
import { AppRouter } from '~/server/routers/_app';

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
  const getLayout =
    Component.getLayout ?? ((page) => <DefaultLayout>{page}</DefaultLayout>);

  return getLayout(<Component {...pageProps} />);
}) as AppType;

export default function App(props: AppPropsWithLayout) {
  const queryClient = new QueryClient();
  const trpcClient = createTRPCClient<AppRouter>({
    links: createLinks(),
  });

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <MyApp {...props} />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
