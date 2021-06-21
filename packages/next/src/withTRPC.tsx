/**
 * Heavily based on urql's ssr
 * https://github.com/FormidableLabs/urql/blob/main/packages/next-urql/src/with-urql-client.ts
 */

import {
  createReactQueryHooks,
  createTRPCClient,
  CreateTRPCClientOptions,
  TRPCClient,
} from '@trpc/react';
import type { AnyRouter, Dict } from '@trpc/server';
import type {
  AppContextType,
  AppPropsType,
  NextComponentType,
  NextPageContext,
} from 'next/dist/next-server/lib/utils';
import React, { createElement, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dehydrate, Hydrate } from 'react-query/hydration';
import ssrPrepass from 'react-ssr-prepass';

type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

export type WithTRPCClientConfig<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> & {
    queryClientConfig?: QueryClientConfig;
  };

export function withTRPC<TRouter extends AnyRouter>(opts: {
  config: (info: { ctx?: NextPageContext }) => WithTRPCClientConfig<TRouter>;
  ssr?: boolean;
}) {
  const { config: getClientConfig, ssr = false } = opts;
  return (AppOrPage: NextComponentType<any, any, any>): NextComponentType => {
    const trpc = createReactQueryHooks<TRouter>();

    const WithTRPC = (
      props: AppPropsType & {
        queryClient?: QueryClient;
        trpcClient?: TRPCClient<TRouter>;
        isPrepass?: boolean;
      },
    ) => {
      const [config] = useState(() => getClientConfig({}));
      const [queryClient] = useState(
        () => props.queryClient ?? new QueryClient(config.queryClientConfig),
      );
      const [trpcClient] = useState(
        () => props.trpcClient ?? trpc.createClient(config),
      );

      const hydratedState = trpc.useDehydratedState(
        trpcClient,
        props.pageProps?.trpcState,
      );

      return (
        <trpc.Provider
          client={trpcClient}
          queryClient={queryClient}
          isPrepass={props.isPrepass}
        >
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
          : (appOrPageCtx as any as NextPageContext);
        const isServer = typeof window === 'undefined' && ssr;

        const config = getClientConfig(isServer ? { ctx } : {});

        const trpcClient = createTRPCClient(config);
        const queryClient = new QueryClient(config.queryClientConfig);

        // Run the wrapped component's getInitialProps function.
        let pageProps: Dict<unknown> = {};
        if (AppOrPage.getInitialProps) {
          const originalProps = await AppOrPage.getInitialProps(
            appOrPageCtx as any,
          );
          const originalPageProps = isApp
            ? originalProps.pageProps ?? {}
            : originalProps;

          pageProps = {
            ...originalPageProps,
            ...pageProps,
          };
        }

        if (typeof window !== 'undefined' || !ssr) {
          const appTreeProps = isApp ? { pageProps } : pageProps;
          return appTreeProps;
        }

        if (ssr) {
          const prepassProps = {
            ...pageProps,
            trpcClient,
            queryClient,
            isPrepass: true,
          };

          // Run the prepass step on AppTree. This will run all trpc queries on the server.
          // multiple prepass ensures that we can do batching on the server
          while (true) {
            await ssrPrepass(createElement(AppTree, prepassProps as any));
            if (!queryClient.isFetching()) {
              break;
            }
            await new Promise<void>((resolve) => {
              const unsub = queryClient.getQueryCache().subscribe((event) => {
                if (event?.query.getObserversCount() === 0) {
                  resolve();
                  unsub();
                }
              });
            });
          }
        }

        pageProps.trpcState = trpcClient.runtime.transformer.serialize(
          dehydrate(queryClient, {
            shouldDehydrateQuery() {
              // makes sure errors are also dehydrated
              return true;
            },
          }),
        );

        const appTreeProps = isApp ? { pageProps } : pageProps;
        return appTreeProps;
      };
    }

    const displayName = AppOrPage.displayName || AppOrPage.name || 'Component';
    WithTRPC.displayName = `withTRPC(${displayName})`;

    return WithTRPC as any;
  };
}
