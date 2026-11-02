/**
 * Heavily based on urql's ssr
 * https://github.com/FormidableLabs/urql/blob/main/packages/next-urql/src/with-urql-client.ts
 */
import type { DehydratedState, QueryClient } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';
import type {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientError,
  TRPCUntypedClient,
} from '@trpc/client';
import type { CoercedTransformerParameters } from '@trpc/client/unstable-internals';
import {
  getTransformer,
  type TransformerOptions,
} from '@trpc/client/unstable-internals';
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
} from 'next/dist/shared/lib/utils.js';
import type { NextRouter } from 'next/router';
import React, { useState } from 'react';

/**
 * @deprecated part of `createTRPCNext`, which is built on `@trpc/react-query`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext
 */
export type WithTRPCConfig<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> &
    CreateTRPCReactQueryClientConfig & {
      abortOnUnmount?: boolean;
    };

type WithTRPCOptions<TRouter extends AnyRouter> =
  CreateTRPCReactOptions<TRouter> & {
    config: (info: { ctx?: NextPageContext }) => WithTRPCConfig<TRouter>;
  } & TransformerOptions<inferClientTypes<TRouter>>;

/**
 * @deprecated part of `ssr: true`, which is built on `@trpc/react-query`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/ssr
 */
export type TRPCPrepassHelper = (opts: {
  parent: WithTRPCSSROptions<AnyRouter>;
  WithTRPC: NextComponentType<any, any, any>;
  AppOrPage: NextComponentType<any, any, any>;
}) => void;
/**
 * @deprecated part of `createTRPCNext`, which is built on `@trpc/react-query`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext
 */
export type WithTRPCSSROptions<TRouter extends AnyRouter> =
  WithTRPCOptions<TRouter> & {
    /**
     * If you enable this, you also need to add a `ssrPrepass`-prop
     * @deprecated built on `@trpc/react-query`. Prefetch each page's queries
     * in `getServerSideProps` with `@trpc/tanstack-react-query` instead.
     * @see https://trpc.io/docs/client/nextjs/pages-router/ssr
     */
    ssr:
      | true
      | ((opts: { ctx: NextPageContext }) => boolean | Promise<boolean>);
    /**
     * @deprecated part of `ssr: true`. Set the status and headers in
     * `getServerSideProps` instead.
     * @see https://trpc.io/docs/client/nextjs/pages-router/ssr#set-the-status-and-cache-headers
     */
    responseMeta?: (opts: {
      ctx: NextPageContext;
      clientErrors: TRPCClientError<TRouter>[];
    }) => ResponseMeta;
    /**
     * use `import { ssrPrepass } from '@trpc/next/ssrPrepass'`
     * @deprecated part of `ssr: true`, which is built on `@trpc/react-query`.
     * @see https://trpc.io/docs/client/nextjs/pages-router/ssr
     */
    ssrPrepass: TRPCPrepassHelper;
  };

/**
 * @deprecated part of `createTRPCNext`, which is built on `@trpc/react-query`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext
 */
export type WithTRPCNoSSROptions<TRouter extends AnyRouter> =
  WithTRPCOptions<TRouter> & {
    ssr?: false;
  };

/**
 * @deprecated part of `ssr: true`, which is built on `@trpc/react-query`.
 * @see https://trpc.io/docs/client/nextjs/pages-router/ssr
 */
export type TRPCPrepassProps<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
> = {
  config: WithTRPCConfig<TRouter>;
  queryClient: QueryClient;
  trpcClient: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>;
  ssrState: 'prepass';
  ssrContext: TSSRContext;
};

/**
 * @deprecated built on `@trpc/react-query`, which only gets bug fixes. Mount
 * `TRPCProvider` from `@trpc/tanstack-react-query` in `_app` instead.
 * @see https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext
 */
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
      }, [trpcState]);

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
        // oxlint-disable-next-line typescript/no-non-null-assertion
        const originalProps = await AppOrPage.getInitialProps!(
          appOrPageCtx as any,
        );
        const originalPageProps = isApp
          ? (originalProps.pageProps ?? {})
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
