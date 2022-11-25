/**
 * Heavily based on urql's ssr
 * https://github.com/FormidableLabs/urql/blob/main/packages/next-urql/src/with-urql-client.ts
 */
import {
  DehydratedState,
  Hydrate,
  QueryClient,
  QueryClientProvider,
  dehydrate,
} from '@tanstack/react-query';
import type { CreateTRPCClientOptions } from '@trpc/client';
import {
  TRPCClient,
  TRPCClientError,
  TRPCClientErrorLike,
  createReactQueryHooks,
  createTRPCClient,
} from '@trpc/react-query';
import {
  CreateTRPCReactOptions,
  CreateTRPCReactQueryClientConfig,
  getQueryClient,
} from '@trpc/react-query/shared';
import type { AnyRouter, Dict, Maybe } from '@trpc/server';
import type { ResponseMeta } from '@trpc/server/http';
import {
  AppContextType,
  AppPropsType,
  NextComponentType,
  NextPageContext,
} from 'next/dist/shared/lib/utils';
import { NextRouter } from 'next/router';
import React, { createElement, useState } from 'react';
import ssrPrepass from 'react-ssr-prepass';

function transformQueryOrMutationCacheErrors<
  TState extends
    | DehydratedState['queries'][0]
    | DehydratedState['mutations'][0],
>(result: TState): TState {
  const error = result.state.error as Maybe<TRPCClientError<any>>;
  if (error instanceof Error && error.name === 'TRPCClientError') {
    const newError: TRPCClientErrorLike<any> = {
      message: error.message,
      data: error.data,
      shape: error.shape,
    };
    return {
      ...result,
      state: {
        ...result.state,
        error: newError,
      },
    };
  }
  return result;
}
export type WithTRPCConfig<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> & {
    abortOnUnmount?: boolean;
  } & CreateTRPCReactQueryClientConfig;

interface WithTRPCOptions<TRouter extends AnyRouter>
  extends CreateTRPCReactOptions<TRouter> {
  config: (info: { ctx?: NextPageContext }) => WithTRPCConfig<TRouter>;
}

export interface WithTRPCSSROptions<TRouter extends AnyRouter>
  extends WithTRPCOptions<TRouter> {
  ssr: true;
  responseMeta?: (opts: {
    ctx: NextPageContext;
    clientErrors: TRPCClientError<TRouter>[];
  }) => ResponseMeta;
}
export interface WithTRPCNoSSROptions<TRouter extends AnyRouter>
  extends WithTRPCOptions<TRouter> {
  ssr?: false;
}

export function withTRPC<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>) {
  const { config: getClientConfig } = opts;

  type TRPCPrepassProps = {
    config: WithTRPCConfig<TRouter>;
    queryClient: QueryClient;
    trpcClient: TRPCClient<TRouter>;
    ssrState: 'prepass';
    ssrContext: TSSRContext;
  };
  return (AppOrPage: NextComponentType<any, any, any>): NextComponentType => {
    const trpc = createReactQueryHooks<TRouter, TSSRContext>({
      unstable_overrides: opts.unstable_overrides,
    });

    const WithTRPC = (
      props: AppPropsType<NextRouter, any> & {
        trpc?: TRPCPrepassProps;
      },
    ) => {
      const [prepassProps] = useState(() => {
        if (props.trpc) {
          return props.trpc;
        }

        const config = getClientConfig({});
        const queryClient = getQueryClient(config);
        const trpcClient = trpc.createClient(config);
        return {
          abortOnUnmount: config.abortOnUnmount,
          queryClient,
          trpcClient,
          ssrState: opts.ssr ? ('mounting' as const) : (false as const),
          ssrContext: null,
        };
      });

      const { queryClient, trpcClient, ssrState, ssrContext } = prepassProps;
      const hydratedState = trpc.useDehydratedState(
        trpcClient,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props.pageProps as any).trpcState,
      );

      return (
        <trpc.Provider
          abortOnUnmount={(prepassProps as any).abortOnUnmount ?? false}
          client={trpcClient}
          queryClient={queryClient}
          ssrState={ssrState}
          ssrContext={ssrContext}
        >
          <QueryClientProvider client={queryClient}>
            <Hydrate state={hydratedState}>
              <AppOrPage {...props} />
            </Hydrate>
          </QueryClientProvider>
        </trpc.Provider>
      );
    };

    if (AppOrPage.getInitialProps || opts.ssr) {
      WithTRPC.getInitialProps = async (appOrPageCtx: AppContextType) => {
        const AppTree = appOrPageCtx.AppTree;

        // Determine if we are wrapping an App component or a Page component.
        const isApp = !!appOrPageCtx.Component;
        const ctx: NextPageContext = isApp
          ? appOrPageCtx.ctx
          : (appOrPageCtx as any as NextPageContext);

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
        const getAppTreeProps = (props: Record<string, unknown>) =>
          isApp ? { pageProps: props } : props;

        if (typeof window !== 'undefined' || !opts.ssr) {
          return getAppTreeProps(pageProps);
        }

        const config = getClientConfig({ ctx });
        const trpcClient = createTRPCClient(config);
        const queryClient = getQueryClient(config);

        const trpcProp: TRPCPrepassProps = {
          config,
          trpcClient,
          queryClient,
          ssrState: 'prepass',
          ssrContext: ctx as TSSRContext,
        };
        const prepassProps = {
          pageProps,
          trpc: trpcProp,
        };

        // Run the prepass step on AppTree. This will run all trpc queries on the server.
        // multiple prepass ensures that we can do batching on the server
        while (true) {
          // render full tree
          await ssrPrepass(createElement(AppTree, prepassProps as any));
          if (!queryClient.isFetching()) {
            // the render didn't cause the queryClient to fetch anything
            break;
          }

          // wait until the query cache has settled it's promises
          await new Promise<void>((resolve) => {
            const unsub = queryClient.getQueryCache().subscribe((event) => {
              if (event?.query.getObserversCount() === 0) {
                resolve();
                unsub();
              }
            });
          });
        }
        const dehydratedCache = dehydrate(queryClient, {
          shouldDehydrateQuery() {
            // makes sure errors are also dehydrated
            return true;
          },
        });
        // since error instances can't be serialized, let's make them into `TRPCClientErrorLike`-objects
        const dehydratedCacheWithErrors = {
          ...dehydratedCache,
          queries: dehydratedCache.queries.map(
            transformQueryOrMutationCacheErrors,
          ),
          mutations: dehydratedCache.mutations.map(
            transformQueryOrMutationCacheErrors,
          ),
        };

        // dehydrate query client's state and add it to the props
        pageProps.trpcState = trpcClient.runtime.transformer.serialize(
          dehydratedCacheWithErrors,
        );

        const appTreeProps = getAppTreeProps(pageProps);

        const meta =
          opts.responseMeta?.({
            ctx,
            clientErrors: [
              ...dehydratedCache.queries,
              ...dehydratedCache.mutations,
            ]
              .map((v) => v.state.error)
              .flatMap((err) =>
                err instanceof Error && err.name === 'TRPCClientError'
                  ? [err as TRPCClientError<TRouter>]
                  : [],
              ),
          }) || {};

        for (const [key, value] of Object.entries(meta.headers || {})) {
          if (typeof value === 'string') {
            ctx.res?.setHeader(key, value);
          }
        }
        if (meta.status && ctx.res) {
          ctx.res.statusCode = meta.status;
        }
        return appTreeProps;
      };
    }

    const displayName = AppOrPage.displayName || AppOrPage.name || 'Component';
    WithTRPC.displayName = `withTRPC(${displayName})`;

    return WithTRPC as any;
  };
}
