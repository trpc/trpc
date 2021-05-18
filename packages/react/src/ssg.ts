import {
  AnyRouter,
  assertNotBrowser,
  ClientDataTransformerOptions,
  inferHandlerInput,
  inferRouterContext,
} from '@trpc/server';
import { QueryClient } from 'react-query';
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
} from 'react-query/hydration';
import {
  CACHE_KEY_INFINITE_QUERY,
  CACHE_KEY_QUERY,
} from './internals/constants';
import { getCacheKey } from './internals/getCacheKey';
type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

assertNotBrowser();

export interface CreateSSGHelpersOptions<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
  transformer?: ClientDataTransformerOptions;
  queryClientConfig?: QueryClientConfig;
}

/**
 * Create functions you can use for server-side rendering / static generation
 */
export function createSSGHelpers<TRouter extends AnyRouter>({
  router,
  transformer,
  ctx,
  queryClientConfig,
}: CreateSSGHelpersOptions<TRouter>) {
  type TQueries = TRouter['_def']['queries'];
  const queryClient = new QueryClient(queryClientConfig);

  const caller = router.createCaller(ctx) as ReturnType<
    TRouter['createCaller']
  >;
  const prefetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    const [path, input] = pathAndArgs;
    const cacheKey = [path, input ?? null, CACHE_KEY_QUERY];

    return queryClient.prefetchQuery(cacheKey, async () => {
      const data = await caller.query(...pathAndArgs);

      return data;
    });
  };

  const prefetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_INFINITE_QUERY);

    return queryClient.prefetchInfiniteQuery(cacheKey, async () => {
      const data = await caller.query(...pathAndArgs);

      return data;
    });
  };

  const fetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    const [path, input] = pathAndArgs;
    const cacheKey = [path, input ?? null, CACHE_KEY_QUERY];

    return queryClient.fetchQuery(cacheKey, async () => {
      const data = await caller.query(...pathAndArgs);

      return data;
    });
  };

  const fetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
  >(
    ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_INFINITE_QUERY);

    return queryClient.fetchInfiniteQuery(cacheKey, async () => {
      const data = await caller.query(...pathAndArgs);

      return data;
    });
  };

  function _dehydrate(
    opts: DehydrateOptions = {
      shouldDehydrateQuery() {
        // makes sure to serialize errors
        return true;
      },
    },
  ): DehydratedState {
    const serialize = transformer
      ? ('input' in transformer ? transformer.input : transformer).serialize
      : (obj: unknown) => obj;

    return serialize(dehydrate(queryClient, opts));
  }

  return {
    prefetchQuery,
    prefetchInfiniteQuery,
    fetchQuery,
    fetchInfiniteQuery,
    dehydrate: _dehydrate,
    queryClient,
  };
}
