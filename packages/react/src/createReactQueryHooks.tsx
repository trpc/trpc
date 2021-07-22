import {
  createTRPCClient,
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientError,
  TRPCRequestOptions,
} from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import React, { ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  hashQueryKey,
  QueryClient,
  QueryKey,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from 'react-query';
import { DehydratedState } from 'react-query/hydration';
import {
  CACHE_KEY_INFINITE_QUERY,
  CACHE_KEY_QUERY,
} from './internals/constants';
import { TRPCContext, TRPCContextState } from './internals/context';
import { getCacheKey } from './internals/getCacheKey';

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

interface TRPCUseQueryBaseOptions extends TRPCRequestOptions {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
}

interface UseTRPCQueryOptions<TInput, TError, TOutput>
  extends UseQueryOptions<TInput, TError, TOutput, QueryKey>,
    TRPCUseQueryBaseOptions {}

interface UseTRPCInfiniteQueryOptions<
  TInput = unknown,
  TError = unknown,
  TOutput = TInput,
> extends UseInfiniteQueryOptions<TInput, TError, TOutput, TOutput, QueryKey>,
    TRPCUseQueryBaseOptions {}

interface UseTRPCMutationOptions<TInput, TError, TOutput>
  extends UseMutationOptions<TOutput, TError, TInput>,
    TRPCUseQueryBaseOptions {}

function getArgs<TPathAndInput extends unknown[], TOptions>(
  pathAndInput: TPathAndInput,
  opts: TOptions,
) {
  const [path, input] = pathAndInput;
  return [path, input, opts] as const;
}
export function createReactQueryHooks<TRouter extends AnyRouter>() {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  type TError = TRPCClientError<TRouter>;

  type ProviderContext = TRPCContextState<TRouter>;
  const Context = TRPCContext as React.Context<ProviderContext>;

  function createClient(opts: CreateTRPCClientOptions<TRouter>) {
    return createTRPCClient(opts);
  }

  function TRPCProvider({
    client,
    queryClient,
    children,
    isPrepass = false,
  }: {
    queryClient: QueryClient;
    client: TRPCClient<TRouter>;
    children: ReactNode;
    isPrepass?: boolean;
  }) {
    return (
      <Context.Provider
        value={{
          queryClient,
          client,
          isPrepass,
          fetchQuery: useCallback(
            (pathAndInput, opts) => {
              const cacheKey = getCacheKey(pathAndInput, CACHE_KEY_QUERY);

              return queryClient.fetchQuery(
                cacheKey,
                () => (client as any).query(...getArgs(pathAndInput, opts)),
                opts,
              );
            },
            [client, queryClient],
          ),
          fetchInfiniteQuery: useCallback(
            (pathAndInput, opts) => {
              const cacheKey = getCacheKey(
                pathAndInput,
                CACHE_KEY_INFINITE_QUERY,
              );

              return queryClient.fetchInfiniteQuery(
                cacheKey,
                () =>
                  (client as any).query(...getArgs(pathAndInput, opts)) as any,
                opts,
              );
            },
            [client, queryClient],
          ),
          prefetchQuery: useCallback(
            (pathAndInput, opts) => {
              const cacheKey = getCacheKey(pathAndInput, CACHE_KEY_QUERY);

              return queryClient.prefetchQuery(
                cacheKey,
                () => (client as any).query(...getArgs(pathAndInput, opts)),
                opts,
              );
            },
            [client, queryClient],
          ),
          prefetchInfiniteQuery: useCallback(
            (pathAndInput, opts) => {
              const cacheKey = getCacheKey(
                pathAndInput,
                CACHE_KEY_INFINITE_QUERY,
              );

              return queryClient.prefetchInfiniteQuery(
                cacheKey,
                () =>
                  (client as any).query(...getArgs(pathAndInput, opts)) as any,
                opts,
              );
            },
            [client, queryClient],
          ),
          invalidateQuery: useCallback(
            (pathAndInput) => {
              return queryClient.invalidateQueries(pathAndInput);
            },
            [queryClient],
          ),
          cancelQuery: useCallback(
            (pathAndInput) => {
              return queryClient.cancelQueries(pathAndInput);
            },
            [queryClient],
          ),
          setQueryData: useCallback(
            (pathAndInput, output) => {
              const cacheKey = getCacheKey(pathAndInput);
              queryClient.setQueryData(
                cacheKey.concat([CACHE_KEY_QUERY]),
                output,
              );
              queryClient.setQueryData(
                cacheKey.concat([CACHE_KEY_INFINITE_QUERY]),
                output,
              );
            },
            [queryClient],
          ),
          getQueryData: useCallback(
            (pathAndInput) => {
              const cacheKey = getCacheKey(pathAndInput);
              return queryClient.getQueryData(cacheKey.concat(CACHE_KEY_QUERY));
            },
            [queryClient],
          ),
        }}
      >
        {children}
      </Context.Provider>
    );
  }

  function useContext() {
    return React.useContext(Context);
  }

  function _useQuery<
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: UseTRPCQueryOptions<
      inferProcedureInput<TQueries[TPath]>,
      TError,
      TOutput
    >,
  ): UseQueryResult<TOutput, TError> {
    const cacheKey = getCacheKey(pathAndInput, CACHE_KEY_QUERY);
    const { client, isPrepass, queryClient, fetchQuery } = useContext();

    if (
      typeof window === 'undefined' &&
      isPrepass &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(cacheKey)
    ) {
      fetchQuery(pathAndInput, opts as any);
    }
    const query = useQuery(
      cacheKey,
      () => (client as any).query(...getArgs(pathAndInput, opts)) as any,
      opts,
    );
    return query;
  }

  function _useMutation<
    TPath extends keyof TMutations & string,
    TInput extends inferProcedureInput<TMutations[TPath]>,
    TOutput extends inferProcedureOutput<TMutations[TPath]>,
  >(path: TPath, opts?: UseTRPCMutationOptions<TInput, TError, TOutput>) {
    const client = useContext().client;
    const hook = useMutation<TOutput, TError, TInput>(
      (input) => (client.mutation as any)(path, input),
      opts,
    );

    return hook;
  }

  /* istanbul ignore next */
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  function useSubscription<
    TPath extends keyof TSubscriptions & string,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
  >(
    pathAndInput: [
      path: TPath,
      ...args: inferHandlerInput<TSubscriptions[TPath]>
    ],
    opts: {
      enabled?: boolean;
      onError?: (err: TError) => void;
      onNext: (data: TOutput) => void;
    },
  ) {
    const enabled = opts?.enabled ?? true;
    const queryKey = hashQueryKey(pathAndInput);
    const client = useContext().client;

    return useEffect(() => {
      if (!enabled) {
        return;
      }
      const [path, input] = pathAndInput;
      let isStopped = false;
      const unsub = client.subscription(path, (input ?? undefined) as any, {
        onError: (err) => {
          if (!isStopped) {
            opts.onError?.(err);
          }
        },
        onNext: (res) => {
          if (res.type === 'data' && !isStopped) {
            opts.onNext(res.data);
          }
        },
      });
      return () => {
        isStopped = true;
        unsub();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryKey, enabled]);
  }

  function _useInfiniteQuery<
    TPath extends keyof TQueries & string,
    TInput extends inferProcedureInput<TQueries[TPath]> & { cursor: TCursor },
    TOutput extends inferProcedureOutput<TQueries[TPath]>,
    TCursor extends any,
  >(
    pathAndInput: [TPath, Omit<TInput, 'cursor'>],
    // FIXME: this typing is wrong but it works
    opts?: UseTRPCInfiniteQueryOptions<TOutput, TError, TOutput>,
  ) {
    const { client, isPrepass, fetchInfiniteQuery, queryClient } = useContext();
    const cacheKey = getCacheKey(pathAndInput, CACHE_KEY_INFINITE_QUERY);
    const [path, input] = pathAndInput;

    if (
      typeof window === 'undefined' &&
      isPrepass &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(cacheKey)
    ) {
      fetchInfiniteQuery(pathAndInput as any, opts as any);
    }
    const query = useInfiniteQuery(
      cacheKey,
      ({ pageParam }) => {
        const actualInput = { ...input, cursor: pageParam };
        return (client.query as any)(path, actualInput);
      },
      opts,
    );

    return query;
  }
  function useDehydratedState(
    client: TRPCClient<TRouter>,
    trpcState: DehydratedState | undefined,
  ) {
    const transformed: DehydratedState | undefined = useMemo(() => {
      if (!trpcState) {
        return trpcState;
      }

      return client.runtime.transformer.deserialize(trpcState);
    }, [client, trpcState]);
    return transformed;
  }

  return {
    Provider: TRPCProvider,
    createClient,
    useContext: useContext,
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscription,
    useDehydratedState,
    useInfiniteQuery: _useInfiniteQuery,
  };
}
