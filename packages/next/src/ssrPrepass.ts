/**
 * Heavily based on urql's ssr
 * https://github.com/FormidableLabs/urql/blob/main/packages/next-urql/src/with-urql-client.ts
 */
import type { DehydratedState } from '@tanstack/react-query';
import { dehydrate } from '@tanstack/react-query';
import { createTRPCUntypedClient } from '@trpc/client';
import type { CoercedTransformerParameters } from '@trpc/client/unstable-internals';
import { getTransformer } from '@trpc/client/unstable-internals';
import type { TRPCClientError, TRPCClientErrorLike } from '@trpc/react-query';
import { getQueryClient } from '@trpc/react-query/shared';
import type {
  AnyRouter,
  Dict,
  Maybe,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  AppContextType,
  NextPageContext,
} from 'next/dist/shared/lib/utils';
import { createElement } from 'react';
import type { TRPCPrepassHelper, TRPCPrepassProps } from './withTRPC';

function transformQueryOrMutationCacheErrors<
  TState extends
    | DehydratedState['mutations'][0]
    | DehydratedState['queries'][0],
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

export const ssrPrepass: TRPCPrepassHelper = (opts) => {
  const { parent, WithTRPC, AppOrPage } = opts;
  type $PrepassProps = TRPCPrepassProps<AnyRouter, any>;

  const transformer = getTransformer(
    (parent as CoercedTransformerParameters).transformer,
  );
  WithTRPC.getInitialProps = async (appOrPageCtx: AppContextType) => {
    const shouldSsr = async () => {
      if (typeof window !== 'undefined') {
        return false;
      }
      if (typeof parent.ssr === 'function') {
        try {
          return await parent.ssr({ ctx: appOrPageCtx.ctx });
        } catch (e) {
          return false;
        }
      }
      return parent.ssr;
    };
    const ssrEnabled = await shouldSsr();
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

    if (typeof window !== 'undefined' || !ssrEnabled) {
      return getAppTreeProps(pageProps);
    }

    const config = parent.config({ ctx });
    const trpcClient = createTRPCUntypedClient(config);
    const queryClient = getQueryClient(config);

    const trpcProp: $PrepassProps = {
      config,
      trpcClient,
      queryClient,
      ssrState: 'prepass',
      ssrContext: ctx,
    };
    const prepassProps = {
      pageProps,
      trpc: trpcProp,
    };

    const reactDomServer = await import('react-dom/server');

    // Run the prepass step on AppTree. This will run all trpc queries on the server.
    // multiple prepass ensures that we can do batching on the server
    while (true) {
      // render full tree
      reactDomServer.renderToString(createElement(AppTree, prepassProps));
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
      shouldDehydrateQuery(query) {
        // filter out queries that are marked as trpc: { ssr: false } or are not enabled, but make sure errors are dehydrated
        const isExcludedFromSSr =
          query.state.fetchStatus === 'idle' &&
          query.state.status === 'pending';
        return !isExcludedFromSSr;
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
    pageProps['trpcState'] = transformer.input.serialize(
      dehydratedCacheWithErrors,
    );

    const appTreeProps = getAppTreeProps(pageProps);

    const meta =
      parent.responseMeta?.({
        ctx,
        clientErrors: [...dehydratedCache.queries, ...dehydratedCache.mutations]
          .map((v) => v.state.error)
          .flatMap((err) =>
            err instanceof Error && err.name === 'TRPCClientError'
              ? [err as TRPCClientError<AnyRouter>]
              : [],
          ),
      }) ?? {};

    for (const [key, value] of Object.entries(meta.headers ?? {})) {
      if (typeof value === 'string') {
        ctx.res?.setHeader(key, value);
      }
    }
    if (meta.status && ctx.res) {
      ctx.res.statusCode = meta.status;
    }

    return appTreeProps;
  };
};
