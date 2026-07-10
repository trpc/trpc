import type { QueryFunctionContext } from '@tanstack/react-query';
import {
  infiniteQueryOptions,
  queryOptions,
  skipToken,
  type QueryClient,
} from '@tanstack/react-query';
import type { TRPCClient, TRPCClientError } from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import type { AnyClientTypes } from '@trpc/server/unstable-core-do-not-import/clientish/inferrable';
import { getClientArgs } from '../internals/getClientArgs';
import type { TRPCQueryKey } from '../internals/getQueryKey';
import {
  buildQueryFromAsyncIterable,
  createTRPCOptionsResult,
} from '../internals/trpcResult';
import type { DefinedTRPCQueryOptionsOut } from '../shared';
import { type TRPCQueryUtils } from '../shared';

export interface CreateQueryUtilsOptions<TRouter extends AnyRouter> {
  /**
   * The `TRPCClient`
   */
  client: TRPCClient<TRouter> | TRPCUntypedClient<TRouter>;
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
    infiniteQueryOptions: (path, queryKey, opts) => {
      const inputIsSkipToken = queryKey[1]?.input === skipToken;

      const queryFn = async (
        queryFnContext: QueryFunctionContext<TRPCQueryKey, unknown>,
      ): Promise<unknown> => {
        const actualOpts = {
          ...opts,
          trpc: {
            ...opts?.trpc,
            ...(opts?.trpc?.abortOnUnmount
              ? { signal: queryFnContext.signal }
              : { signal: null }),
          },
        };

        const result = await untypedClient.query(
          ...getClientArgs(queryKey, actualOpts, {
            direction: queryFnContext.direction,
            pageParam: queryFnContext.pageParam,
          }),
        );

        return result;
      };

      return Object.assign(
        infiniteQueryOptions({
          ...opts,
          initialData: opts?.initialData as any,
          queryKey,
          queryFn: inputIsSkipToken ? skipToken : queryFn,
          initialPageParam: (opts?.initialCursor as any) ?? null,
        }),
        { trpc: createTRPCOptionsResult({ path }) },
      );
    },

    queryOptions: (path, queryKey, opts) => {
      const inputIsSkipToken = queryKey[1]?.input === skipToken;

      const queryFn = async (
        queryFnContext: QueryFunctionContext<TRPCQueryKey>,
      ): Promise<unknown> => {
        const actualOpts = {
          ...opts,
          trpc: {
            ...opts?.trpc,
            ...(opts?.trpc?.abortOnUnmount
              ? { signal: queryFnContext.signal }
              : { signal: null }),
          },
        };

        const result = await untypedClient.query(
          ...getClientArgs(queryKey, actualOpts),
        );

        if (isAsyncIterable(result)) {
          return buildQueryFromAsyncIterable(result, queryClient, queryKey);
        }

        return result;
      };

      return Object.assign(
        queryOptions({
          ...opts,
          initialData: opts?.initialData,
          queryKey,
          queryFn: inputIsSkipToken ? skipToken : queryFn,
        }),
        { trpc: createTRPCOptionsResult({ path }) },
      ) as DefinedTRPCQueryOptionsOut<
        unknown,
        unknown,
        TRPCClientError<AnyClientTypes>
      >;
    },

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

    setMutationDefaults: (mutationKey, options) => {
      const path = mutationKey[0];
      const canonicalMutationFn = (input: unknown) => {
        return untypedClient.mutation(
          ...getClientArgs([path, { input }], opts),
        );
      };
      return queryClient.setMutationDefaults(
        mutationKey,
        typeof options === 'function'
          ? options({ canonicalMutationFn })
          : options,
      );
    },

    getMutationDefaults: (mutationKey) => {
      return queryClient.getMutationDefaults(mutationKey);
    },

    isMutating: (filters) => {
      return queryClient.isMutating({
        ...filters,
        exact: true,
      });
    },
  };
}
