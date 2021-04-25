import React from 'react';
import {
  createTRPCClient,
  CreateTRPCClientOptions,
  createReactQueryHooks,
  TRPCClient,
} from './';
import { getDataFromTree } from './ssr';
import type { AnyRouter, Dict } from '@trpc/server';
import type {
  AppContextType,
  AppPropsType,
  NextComponentType,
} from 'next/dist/next-server/lib/utils';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dehydrate, Hydrate } from 'react-query/hydration';
type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

export interface WithTRPCClientOptions<TRouter extends AnyRouter>
  extends CreateTRPCClientOptions<TRouter> {
  queryClientConfig?: QueryClientConfig;
  ssr?: boolean;
}

export function withTRPCClient<TRouter extends AnyRouter>(
  AppOrPage: NextComponentType<any, any, any>,
  opts: WithTRPCClientOptions<TRouter>,
) {
  const { queryClientConfig, ssr = false, ...trpcOptions } = opts;
  const trpc = createReactQueryHooks<TRouter>();

  const WithTRPC = (
    props: AppPropsType & {
      queryClient?: QueryClient;
      trpcClient?: TRPCClient<TRouter>;
    },
  ) => {
    const { pageProps } = props;
    const [queryClient] = useState(
      () => props.queryClient ?? new QueryClient(queryClientConfig),
    );
    const [trpcClient] = useState(
      () => props.trpcClient ?? trpc.createClient(trpcOptions),
    );

    const hydratedState = trpc.useDehydratedState(
      trpcClient,
      pageProps.dehydratedState,
    );

    console.log(
      'pagePropspageProps.dehydratedState',
      pageProps.dehydratedState,
    );

    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient} ssr={ssr}>
        <QueryClientProvider client={queryClient}>
          <Hydrate state={hydratedState}>
            <AppOrPage {...props} />
          </Hydrate>
        </QueryClientProvider>
      </trpc.Provider>
    );
  };

  if (AppOrPage.getInitialProps || ssr) {
    console.log(
      'applying ssr',
      "typeof window === 'undefined'",
      typeof window === 'undefined',
    );
    WithTRPC.getInitialProps = async (appOrPageCtx: AppContextType) => {
      const AppTree = appOrPageCtx.AppTree;
      const trpcClient = createTRPCClient(trpcOptions);

      // Determine if we are wrapping an App component or a Page component.
      const isApp = !!appOrPageCtx.Component;
      const ctx = isApp ? appOrPageCtx : appOrPageCtx.ctx;

      // Run the wrapped component's getInitialProps function.
      let pageProps: Dict<unknown> = {};
      if (AppOrPage.getInitialProps) {
        pageProps = await AppOrPage.getInitialProps(ctx as any);
      }

      const queryClient = new QueryClient(queryClientConfig);

      if (typeof window === 'undefined' && ssr) {
        await getDataFromTree(
          <AppTree
            pageProps={pageProps}
            {...{
              trpcClient,
              queryClient,
            }}
          />,
          queryClient,
        );
      }
      pageProps.dehydratedState = trpcClient.transformer.serialize(
        dehydrate(queryClient, {
          shouldDehydrateQuery() {
            // makes sure errors are also dehydrated
            return true;
          },
        }),
      );
      console.log('pageProps.dehydratedState', pageProps.dehydratedState);

      return {
        pageProps,
      };
    };
  }

  const displayName = AppOrPage.displayName || AppOrPage.name || 'Component';
  WithTRPC.displayName = `withTRPCClient(${displayName})`;

  return WithTRPC;
}
