import { TRPCClient } from '@trpc/client';
import { AnyRouter, assertNotBrowser, inferHandlerInput } from '@trpc/server';
import { QueryClient } from 'react-query';
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
} from 'react-query/hydration';
import { CACHE_KEY_INFINITE_QUERY, CACHE_KEY_QUERY, getCacheKey } from './';

assertNotBrowser();
export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

/**
 * Create functions you can use for server-side rendering / static generation
 * @param router Your app's router
 * @param ctx Context used in the calls
 */
export function createSSGHelpers<TRouter extends AnyRouter>({
  client,
  queryClient = new QueryClient(),
}: {
  client: TRPCClient<TRouter>;
  queryClient?: QueryClient;
}) {
  type TQueries = TRouter['_def']['queries'];

  /**
   * Create functions you can use for server-side rendering / static generation
   * @param router Your app's router
   * @param ctx Context used in the calls
   */
  const prefetchQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath]
  >(
    ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    const [path, input] = pathAndArgs;
    const cacheKey = [path, input ?? null, CACHE_KEY_QUERY];

    return queryClient.prefetchQuery(cacheKey, async () => {
      const data = await client.query(...pathAndArgs);

      return data;
    });
  };

  const prefetchInfiniteQuery = async <
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath]
  >(
    ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
  ) => {
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_INFINITE_QUERY);

    return queryClient.prefetchInfiniteQuery(cacheKey, async () => {
      const data = await client.query(...pathAndArgs);

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
    return client.transformer.serialize(dehydrate(queryClient, opts));
  }

  return {
    client,
    prefetchQuery,
    prefetchInfiniteQuery,
    dehydrate: _dehydrate,
  };
}
