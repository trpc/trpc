import { QueryClient } from '@tanstack/react-query';
import {
  CreateTRPCClient,
  getUntypedClient,
  TRPCUntypedClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { getClientArgs } from './internals/getClientArgs';
import { createQueryUtils } from './shared';

interface CreateQueryUtilsOptions<TRouter extends AnyRouter> {
  /**
   * The `TRPCClient`
   */
  client: CreateTRPCClient<TRouter>;
  /**
   * The `QueryClient` from `react-query`
   */
  queryClient: QueryClient;
}

export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  opts: CreateQueryUtilsOptions<TRouter>,
) {
  const { client, queryClient } = opts;
  const untypedClient =
    client instanceof TRPCUntypedClient ? client : getUntypedClient(client);

  return createQueryUtils<TRouter>({
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
        queryFn: ({ pageParam }) => {
          return untypedClient.query(
            ...getClientArgs(queryKey, opts, pageParam),
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
        queryFn: ({ pageParam }) => {
          return untypedClient.query(
            ...getClientArgs(queryKey, opts, pageParam),
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

    getQueryData: (queryKey) => {
      return queryClient.getQueryData(queryKey);
    },

    setInfiniteQueryData: (queryKey, updater, options) => {
      return queryClient.setQueryData(queryKey, updater as any, options);
    },

    getInfiniteQueryData: (queryKey) => {
      return queryClient.getQueryData(queryKey);
    },
  });
}
