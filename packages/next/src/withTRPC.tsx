/**
 * Heavily based on urql's ssr
 * https://github.com/FormidableLabs/urql/blob/main/packages/next-urql/src/with-urql-client.ts
 */
import type { DehydratedState, QueryClient } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import type { CreateTRPCClientOptions, TRPCUntypedClient } from '@trpc/client';
import type { CoercedTransformerParameters } from '@trpc/client/unstable-internals';
import {
  getTransformer,
  type TransformerOptions,
} from '@trpc/client/unstable-internals';
import type { TRPCClientError } from '@trpc/react-query';
import type {
  CreateTRPCReactOptions,
  CreateTRPCReactQueryClientConfig,
} from '@trpc/react-query/shared';
import { createRootHooks, getQueryClient } from '@trpc/react-query/shared';
import type {
  AnyRouter,
  Dict,
  inferClientTypes,
  ResponseMeta,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  AppContextType,
  AppPropsType,
  NextComponentType,
  NextPageContext,
} from 'next/dist/shared/lib/utils';
import type { NextRouter } from 'next/router';
import React, { useState } from 'react';

export type WithTRPCConfig<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> &
    CreateTRPCReactQueryClientConfig & {
      abortOnUnmount?: boolean;
    };

type WithTRPCOptions<TRouter extends AnyRouter> =
  CreateTRPCReactOptions<TRouter> & {
    config: (info: { ctx?: NextPageContext }) => WithTRPCConfig<TRouter>;
  } & TransformerOptions<inferClientTypes<TRouter>>;

export type TRPCPrepassHelper = (opts: {
  parent: WithTRPCSSROptions<AnyRouter>;
  WithTRPC: NextComponentType<any, any, any>;
  AppOrPage: NextComponentType<any, any, any>;
}) => void;
export type WithTRPCSSROptions<TRouter extends AnyRouter> =
  WithTRPCOptions<TRouter> & {
    /**
     * If you enable this, you also need to add a `ssrPrepass`-prop
     * @link https://trpc.io/docs/client/nextjs/ssr
     */
    ssr:
      | true
      | ((opts: { ctx: NextPageContext }) => boolean | Promise<boolean>);
    responseMeta?: (opts: {
      ctx: NextPageContext;
      clientErrors: TRPCClientError<TRouter>[];
    }) => ResponseMeta;
    /**
     * use `import { ssrPrepass } from '@trpc/next/ssrPrepass'`
     * @link https://trpc.io/docs/client/nextjs/ssr
     */
    ssrPrepass: TRPCPrepassHelper;
  };

export type WithTRPCNoSSROptions<TRouter extends AnyRouter> =
  WithTRPCOptions<TRouter> & {
    ssr?: false;
  };

export type TRPCPrepassProps<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
> = {
  config: WithTRPCConfig<TRouter>;
  queryClient: QueryClient;
  trpcClient: TRPCUntypedClient<TRouter>;
  ssrState: 'prepass';
  ssrContext: TSSRContext;
};

export function withTRPC<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>) {
  const { config: getClientConfig } = opts;
  const transformer = getTransformer(
    (opts as CoercedTransformerParameters).transformer,
  );

  type $PrepassProps = TRPCPrepassProps<TRouter, TSSRContext>;
  return (AppOrPage: NextComponentType<any, any, any>): NextComponentType => {
    const trpc = createRootHooks<TRouter, TSSRContext>(opts);

    const WithTRPC = (
      props: AppPropsType<NextRouter, any> & {
        trpc?: $PrepassProps;
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

      // allow normal components to be wrapped, not just app/pages
      const trpcState = props.pageProps?.trpcState;

      const hydratedState: DehydratedState | undefined = React.useMemo(() => {
        if (!trpcState) {
          return trpcState;
        }

        return transformer.input.deserialize(trpcState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [trpcState, trpcClient]);

      return (
        <trpc.Provider
          abortOnUnmount={(prepassProps as any).abortOnUnmount ?? false}
          client={trpcClient}
          queryClient={queryClient}
          ssrState={ssrState}
          ssrContext={ssrContext}
        >
          <QueryClientProvider client={queryClient}>
            <HydrationBoundary state={hydratedState}>
              <AppOrPage {...props} />
            </HydrationBoundary>
          </QueryClientProvider>
        </trpc.Provider>
      );
    };

    if (opts.ssr) {
      opts.ssrPrepass({
        parent: opts,
        AppOrPage,
        WithTRPC,
      });
    } else if (AppOrPage.getInitialProps) {
      // Allow combining `getServerSideProps` and `getInitialProps`

      WithTRPC.getInitialProps = async (appOrPageCtx: AppContextType) => {
        // Determine if we are wrapping an App component or a Page component.
        const isApp = !!appOrPageCtx.Component;

        // Run the wrapped component's getInitialProps function.
        let pageProps: Dict<unknown> = {};
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const originalProps = await AppOrPage.getInitialProps!(
          appOrPageCtx as any,
        );
        const originalPageProps = isApp
          ? originalProps.pageProps ?? {}
          : originalProps;

        pageProps = {
          ...originalPageProps,
          ...pageProps,
        };
        const getAppTreeProps = (props: Dict<unknown>) =>
          isApp ? { pageProps: props } : props;

        return getAppTreeProps(pageProps);
      };
    }

    const displayName = AppOrPage.displayName ?? AppOrPage.name ?? 'Component';
    WithTRPC.displayName = `withTRPC(${displayName})`;

    return WithTRPC as any;
  };
}
