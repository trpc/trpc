import React from 'react';
import {
  createTRPCClient,
  CreateTRPCClientOptions,
  createReactQueryHooks,
  TRPCClient,
} from '@trpc/react';
import { getDataFromTree } from '@trpc/react/ssr';
import type { AnyRouter, Dict } from '@trpc/server';
import type {
  AppContextType,
  AppPropsType,
  NextComponentType,
  NextPageContext,
} from 'next/dist/next-server/lib/utils';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dehydrate, Hydrate } from 'react-query/hydration';
type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

export interface WithTRPCClientConfig<TRouter extends AnyRouter>
  extends CreateTRPCClientOptions<TRouter> {
  queryClientConfig?: QueryClientConfig;
}

interface WithTRPCClientOptions {
  ssr?: boolean;
}

export function withTRPCClient<TRouter extends AnyRouter>(
  getClientConfig: (info: {
    ctx?: NextPageContext;
  }) => WithTRPCClientConfig<TRouter>,
  { ssr = false }: WithTRPCClientOptions = {},
) {
  return (AppOrPage: NextComponentType<any, any, any>) => {
    const trpc = createReactQueryHooks<TRouter>();

    const WithTRPC = (
      props: AppPropsType & {
        queryClient?: QueryClient;
        trpcClient?: TRPCClient<TRouter>;
      },
    ) => {
      const [queryClient] = useState(
        () =>
          props.queryClient ??
          new QueryClient(getClientConfig({}).queryClientConfig),
      );
      const [trpcClient] = useState(
        () => props.trpcClient ?? trpc.createClient(getClientConfig({})),
      );

      const hydratedState = trpc.useDehydratedState(
        trpcClient,
        props.pageProps.trpcState,
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
      WithTRPC.getInitialProps = async (appOrPageCtx: AppContextType) => {
        const AppTree = appOrPageCtx.AppTree;

        // Determine if we are wrapping an App component or a Page component.
        const isApp = !!appOrPageCtx.Component;
        const ctx: NextPageContext = isApp
          ? appOrPageCtx.ctx
          : ((appOrPageCtx as any) as NextPageContext);
        const isServer = typeof window === 'undefined' && ssr;

        const config = getClientConfig(isServer ? { ctx } : {});

        const trpcClient = createTRPCClient(config);
        const queryClient = new QueryClient(config.queryClientConfig);

        // Run the wrapped component's getInitialProps function.
        let pageProps: Dict<unknown> = {};
        if (AppOrPage.getInitialProps) {
          pageProps = await AppOrPage.getInitialProps(appOrPageCtx as any);
        }

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
        pageProps.trpcState = trpcClient.transformer.serialize(
          dehydrate(queryClient, {
            shouldDehydrateQuery() {
              // makes sure errors are also dehydrated
              return true;
            },
          }),
        );

        return {
          pageProps,
        };
      };
    }

    const displayName = AppOrPage.displayName || AppOrPage.name || 'Component';
    WithTRPC.displayName = `withTRPCClient(${displayName})`;

    return WithTRPC;
  };
}
