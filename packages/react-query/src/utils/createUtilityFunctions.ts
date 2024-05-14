import type { QueryClient } from '@tanstack/react-query';
import type { CreateTRPCClient } from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { getClientArgs } from '../internals/getClientArgs';
import type { TRPCQueryUtils } from '../shared';

export interface CreateQueryUtilsOptions<TRouter extends AnyRouter> {
  /**
   * The `TRPCClient`
   */
  client: CreateTRPCClient<TRouter> | TRPCUntypedClient<TRouter>;
  /**
   * The `QueryClient` from `react-query`
   */
  queryClient: QueryClient;
}

/**
 * Creates a set of utility functions that can be used to interact with `react-query`
 * @param opts the `TRPCClient` and `QueryClient` to use
 * @returns a set of utility functions that can be used to interact with `react-query`
 * @internal
 */
export function createUtilityFunctions<TRouter extends AnyRouter>(
  opts: CreateQueryUtilsOptions<TRouter>,
): TRPCQueryUtils<TRouter> {
  const { client, queryClient } = opts;
  const untypedClient =
    client instanceof TRPCUntypedClient ? client : getUntypedClient(client);

  return {
    fetchQuery: (queryKey, opts) => {
      return queryClient.fetchQuery({
        ...opts,
        queryKey,
        queryFn: () => untypedClient.query(...getClientArgs(queryKey, opts)),
      });
    },

    fetchInfiniteQuery: (queryKey, opts) => {
      return queryClient.fetchInfiniteQuery({
        ...opts,
        queryKey,
        queryFn: ({ pageParam, direction }) => {
          return untypedClient.query(
            ...getClientArgs(queryKey, opts, { pageParam, direction }),
          );
        },
        initialPageParam: opts?.initialCursor ?? null,
      });
    },

    prefetchQuery: (queryKey, opts) => {
      return queryClient.prefetchQuery({
        ...opts,
        queryKey,
        queryFn: () => untypedClient.query(...getClientArgs(queryKey, opts)),
      });
    },

    prefetchInfiniteQuery: (queryKey, opts) => {
      return queryClient.prefetchInfiniteQuery({
        ...opts,
        queryKey,
        queryFn: ({ pageParam, direction }) => {
          return untypedClient.query(
            ...getClientArgs(queryKey, opts, { pageParam, direction }),
          );
        },
        initialPageParam: opts?.initialCursor ?? null,
      });
    },

    ensureQueryData: (queryKey, opts) => {
      return queryClient.ensureQueryData({
        ...opts,
        queryKey,
        queryFn: () => untypedClient.query(...getClientArgs(queryKey, opts)),
      });
    },

    invalidateQueries: (queryKey, filters, options) => {
      return queryClient.invalidateQueries(
        {
          ...filters,
          queryKey,
        },
        options,
      );
    },
    resetQueries: (queryKey, filters, options) => {
      return queryClient.resetQueries(
        {
          ...filters,
          queryKey,
        },
        options,
      );
    },

    refetchQueries: (queryKey, filters, options) => {
      return queryClient.refetchQueries(
        {
          ...filters,
          queryKey,
        },
        options,
      );
    },

    cancelQuery: (queryKey, options) => {
      return queryClient.cancelQueries(
        {
          queryKey,
        },
        options,
      );
    },

    setQueryData: (queryKey, updater, options) => {
      return queryClient.setQueryData(queryKey, updater as any, options);
    },

    // eslint-disable-next-line max-params
    setQueriesData: (queryKey, filters, updater, options) => {
      return queryClient.setQueriesData(
        {
          ...filters,
          queryKey,
        },
        updater,
        options,
      );
    },

    getQueryData: (queryKey) => {
      return queryClient.getQueryData(queryKey);
    },

    setInfiniteQueryData: (queryKey, updater, options) => {
      return queryClient.setQueryData(queryKey, updater as any, options);
    },

    getInfiniteQueryData: (queryKey) => {
      return queryClient.getQueryData(queryKey);
    },
  };
}
