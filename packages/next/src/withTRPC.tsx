/**
 * Heavily based on urql's ssr
 * https://github.com/FormidableLabs/urql/blob/main/packages/next-urql/src/with-urql-client.ts
 */

import {
  createReactQueryHooks,
  createTRPCClient,
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientError,
  TRPCClientErrorLike,
} from '@trpc/react';
import type { AnyRouter, Dict, Maybe, ResponseMeta } from '@trpc/server';
import {
  AppContextType,
  AppPropsType,
  NextComponentType,
  NextPageContext,
} from 'next/dist/shared/lib/utils';
import React, { createElement, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { dehydrate, DehydratedState, Hydrate } from 'react-query/hydration';
import ssrPrepass from 'react-ssr-prepass';

type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

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
    queryClientConfig?: QueryClientConfig;
  };

interface CreateTRPCHOCOptions<TRouter extends AnyRouter> {
  config: (info: { ctx?: NextPageContext }) => WithTRPCConfig<TRouter>;
  responseMeta?: (opts: {
    ctx: NextPageContext;
    clientErrors: TRPCClientError<TRouter>[];
  }) => ResponseMeta;
}
export function createTRPCHOC<TRouter extends AnyRouter>(
  opts: CreateTRPCHOCOptions<TRouter>,
) {
  const { config: getClientConfig } = opts;

  type TRPCPrepassProps = {
    config: WithTRPCConfig<TRouter>;
    queryClient: QueryClient;
    trpcClient: TRPCClient<TRouter>;
    isPrepass: true;
    ssrContext: NextPageContext;
  };
  const trpc = createReactQueryHooks<TRouter, NextPageContext>();
  async function prepass(
    appOrPageContext: NextPageContext | AppContextType,
    originalProps: Dict<unknown> = {},
  ) {
    const AppTree = appOrPageContext.AppTree;

    const ctx =
      'Component' in appOrPageContext ? appOrPageContext.ctx : appOrPageContext;

    const config = getClientConfig({ ctx });
    const trpcClient = createTRPCClient(config);
    const queryClient = new QueryClient(config.queryClientConfig);

    const trpcProp: TRPCPrepassProps = {
      config,
      trpcClient,
      queryClient,
      isPrepass: true,
      ssrContext: appOrPageContext as any,
    };
    const prepassProps = {
      pageProps: originalProps,
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
      queries: dehydratedCache.queries.map(transformQueryOrMutationCacheErrors),
      mutations: dehydratedCache.mutations.map(
        transformQueryOrMutationCacheErrors,
      ),
    };
    // dehydrate query client's state and add it to the props
    const trpcState = trpcClient.runtime.transformer.serialize(
      dehydratedCacheWithErrors,
    );

    const appTreeProps = {
      trpcState,
    };

    const meta =
      opts.responseMeta?.({
        ctx,
        clientErrors: [...dehydratedCache.queries, ...dehydratedCache.mutations]
          .map((v) => v.state.error)
          .flatMap((err) =>
            err instanceof Error && err.name === 'TRPCClientError'
              ? [err as TRPCClientError<TRouter>]
              : [],
          ),
      }) ?? {};

    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string') {
        ctx.res?.setHeader(key, value);
      }
    }
    if (meta.status && ctx.res) {
      ctx.res.statusCode = meta.status;
    }
    return appTreeProps;
  }

  const withTRPC =
    (opts: { ssr?: boolean }) =>
    (AppOrPage: NextComponentType<any, any, any>): NextComponentType => {
      const WithTRPC = (
        props: AppPropsType & {
          trpc?: TRPCPrepassProps;
        },
      ) => {
        const [{ queryClient, trpcClient, isPrepass, ssrContext }] = useState(
          () => {
            if (props.trpc) {
              return props.trpc;
            }
            const config = getClientConfig({});
            const queryClient = new QueryClient(config.queryClientConfig);
            const trpcClient = trpc.createClient(config);
            return {
              queryClient,
              trpcClient,
              isPrepass: false,
              ssrContext: null,
            };
          },
        );

        const hydratedState = trpc.useDehydratedState(
          trpcClient,
          props.pageProps?.trpcState,
        );

        return (
          <trpc.Provider
            client={trpcClient}
            queryClient={queryClient}
            isPrepass={isPrepass}
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

      if (opts.ssr) {
        WithTRPC.getInitialProps = async (
          appOrPageCtx: AppContextType | NextPageContext,
        ) => {
          // Determine if we are wrapping an App component or a Page component.
          const ctx: NextPageContext =
            'Component' in appOrPageCtx ? appOrPageCtx.ctx : appOrPageCtx;

          // Run the wrapped component's getInitialProps function.
          let pageProps: Dict<unknown> = {};
          if (AppOrPage.getInitialProps) {
            const originalProps = await AppOrPage.getInitialProps(
              appOrPageCtx as any,
            );
            const originalPageProps =
              'Component' in appOrPageCtx
                ? originalProps.pageProps ?? {}
                : originalProps;

            pageProps = {
              ...originalPageProps,
              ...pageProps,
            };
          }

          const props = await prepass(ctx, pageProps);

          return 'Component' in appOrPageCtx
            ? {
                pageProps: props,
              }
            : props;
        };
      }

      const displayName =
        AppOrPage.displayName || AppOrPage.name || 'Component';
      WithTRPC.displayName = `withTRPC(${displayName})`;

      return WithTRPC as any;
    };
  return {
    prepass,
    withTRPC,
    trpc,
  };
}

export function withTRPC<TRouter extends AnyRouter>(
  opts: {
    config: (info: { ctx?: NextPageContext }) => WithTRPCConfig<TRouter>;
  } & (
    | {
        ssr?: false;
      }
    | {
        ssr: true;
        responseMeta?: (opts: {
          ctx: NextPageContext;
          clientErrors: TRPCClientError<TRouter>[];
        }) => ResponseMeta;
      }
  ),
) {
  return createTRPCHOC(opts).withTRPC(opts);
}
