import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCClient,
  httpBatchStreamLink,
  loggerLink,
} from '@trpc/client';
import type { NextPage } from 'next';
import type { AppProps } from 'next/app';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { DefaultLayout } from '~/components/DefaultLayout';
import type { AppRouter } from '~/server/routers/_app';
import { makeQueryClient } from '~/utils/query-client';
import { transformer } from '~/utils/transformer';
import { TRPCProvider } from '~/utils/trpc';
import type { TRPCState } from '~/utils/use-trpc-state';
import { useTRPCState } from '~/utils/use-trpc-state';
import '~/styles/globals.css';

export type NextPageWithLayout<
  TProps = Record<string, unknown>,
  TInitialProps = TProps,
> = NextPage<TProps, TInitialProps> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps<{ trpcState?: TRPCState }> & {
  Component: NextPageWithLayout;
};

/**
 * @see https://trpc.io/docs/v11/client/nextjs/pages-router/setup#6-configure-_apptsx
 */
export default function MyApp({ Component, pageProps }: AppPropsWithLayout) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      /**
       * @see https://trpc.io/docs/v11/client/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchStreamLink({
          // the client only calls the API from the browser, so a relative URL is enough
          url: '/api/trpc',
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer,
        }),
      ],
    }),
  );
  const trpcState = useTRPCState(pageProps.trpcState);

  const getLayout =
    Component.getLayout ?? ((page) => <DefaultLayout>{page}</DefaultLayout>);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <HydrationBoundary state={trpcState}>
          {getLayout(<Component {...pageProps} />)}
        </HydrationBoundary>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
