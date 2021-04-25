import {
  createTRPCClient,
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientError,
} from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  hashQueryKey,
  InfiniteData,
  QueryClient,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from 'react-query';
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
} from 'react-query/hydration';

type TRPCContextState<TRouter extends AnyRouter> = {
  queryClient: QueryClient;
  client: TRPCClient<TRouter>;
  ssr: boolean;

  fetchQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<TOutput>;
  fetchInfiniteQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchInfiniteQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<InfiniteData<TOutput>>;
  prefetchQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<void>;

  prefetchInfiniteQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchInfiniteQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<void>;

  invalidateQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>
  >(
    pathAndArgs: [TPath, TInput?],
  ) => Promise<void>;
  cancelQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>
  >(
    pathAndArgs: [TPath, TInput?],
  ) => Promise<void>;
  setQueryData: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>
  >(
    pathAndArgs: [TPath, TInput?],
    output: TOutput,
  ) => void;
};

export function getCacheKey<TTuple extends [string, ...unknown[]]>(
  [path, input]: TTuple,
  extras?: string,
) {
  const cacheKey = [path, input ?? null];
  if (extras) {
    cacheKey.push(extras);
  }
  return cacheKey;
}

export const CACHE_KEY_INFINITE_QUERY = 'TRPC_INFINITE_QUERY' as const;
export const CACHE_KEY_LIVE_QUERY = 'TRPC_LIVE_QUERY' as const;
export const CACHE_KEY_QUERY = 'TRPC_QUERY' as const;

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

const _TRPCContext = createContext({} as any);

export function createReactQueryHooks<TRouter extends AnyRouter>() {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  type TError = TRPCClientError<TRouter>;

  type ProviderContext = TRPCContextState<TRouter>;
  const TRPCContext = _TRPCContext as React.Context<ProviderContext>;

  function createClient(opts: CreateTRPCClientOptions<TRouter>) {
    return createTRPCClient(opts);
  }
  /**
   * Create functions you can use for server-side rendering / static generation
   * @param router Your app's router
   * @param ctx Context used in the calls
   */
  function ssr({
    client,
    queryClient = new QueryClient(),
  }: {
    client: TRPCClient<TRouter>;
    queryClient?: QueryClient;
  }) {
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

    function _dehydrate(opts?: DehydrateOptions): DehydratedState {
      return client.transformer.serialize(dehydrate(queryClient, opts));
    }

    return {
      client,
      prefetchQuery,
      prefetchInfiniteQuery,
      dehydrate: _dehydrate,
    };
  }

  function TRPCProvider({
    client,
    queryClient,
    children,
    ssr = false,
  }: {
    queryClient: QueryClient;
    client: TRPCClient<TRouter>;
    children: ReactNode;
    ssr?: boolean;
  }) {
    return (
      <TRPCContext.Provider
        value={{
          queryClient,
          client,
          ssr,
          fetchQuery: useCallback(
            (pathAndArgs, opts) => {
              const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_QUERY);

              return queryClient.fetchQuery(
                cacheKey,
                () => client.query(...pathAndArgs) as any,
                opts,
              );
            },
            [client, queryClient],
          ),
          fetchInfiniteQuery: useCallback(
            (pathAndArgs, opts) => {
              const cacheKey = getCacheKey(
                pathAndArgs,
                CACHE_KEY_INFINITE_QUERY,
              );

              return queryClient.fetchInfiniteQuery(
                cacheKey,
                () => client.query(...pathAndArgs) as any,
                opts,
              );
            },
            [client, queryClient],
          ),
          prefetchQuery: useCallback(
            (pathAndArgs, opts) => {
              const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_QUERY);

              return queryClient.prefetchQuery(
                cacheKey,
                () => client.query(...pathAndArgs) as any,
                opts,
              );
            },
            [client, queryClient],
          ),
          prefetchInfiniteQuery: useCallback(
            (pathAndArgs, opts) => {
              const cacheKey = getCacheKey(
                pathAndArgs,
                CACHE_KEY_INFINITE_QUERY,
              );

              return queryClient.prefetchInfiniteQuery(
                cacheKey,
                () => client.query(...pathAndArgs) as any,
                opts,
              );
            },
            [client, queryClient],
          ),
          invalidateQuery: useCallback(
            (pathAndArgs) => {
              const cacheKey = getCacheKey(pathAndArgs);
              return queryClient.invalidateQueries(cacheKey);
            },
            [queryClient],
          ),
          cancelQuery: useCallback(
            (pathAndArgs) => {
              const cacheKey = getCacheKey(pathAndArgs);
              return queryClient.cancelQueries(cacheKey);
            },
            [queryClient],
          ),
          setQueryData: useCallback(
            (pathAndArgs, output) => {
              const cacheKey = getCacheKey(pathAndArgs);
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
        }}
      >
        {children}
      </TRPCContext.Provider>
    );
  }

  function useContext() {
    return React.useContext(TRPCContext);
  }

  function _useQuery<
    TPath extends keyof TQueries & string,
    TProcedure extends TQueries[TPath],
    TOutput extends inferProcedureOutput<TProcedure>
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: UseQueryOptions<
      inferProcedureInput<TQueries[TPath]>,
      TError,
      TOutput
    >,
  ): UseQueryResult<TOutput, TError> {
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_QUERY);
    const { client, prefetchQuery, ssr, queryClient } = useContext();

    if (typeof window === 'undefined' && ssr) {
      const hashed = hashQueryKey(cacheKey);
      const cache = queryClient.getQueryCache().get(hashed);
      console.log('fetching', { hashed, cache });
      if (!cache) {
        prefetchQuery(pathAndArgs);
      }
    }
    const query = useQuery(
      cacheKey,
      () => client.query(...pathAndArgs) as any,
      opts,
    );
    return query;
  }

  function _useMutation<
    TPath extends keyof TMutations & string,
    TInput extends inferProcedureInput<TMutations[TPath]>,
    TOutput extends inferProcedureOutput<TMutations[TPath]>
  >(path: TPath, opts?: UseMutationOptions<TOutput, TError, TInput>) {
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
    TInput extends inferProcedureInput<TSubscriptions[TPath]>,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(
    pathAndArgs: [TPath, TInput],
    opts?: {
      enabled?: boolean;
      onError?: (err: TError) => void;
      onBatch?: (data: TOutput[]) => void;
    },
  ) {
    const enabled = opts?.enabled ?? true;
    const queryKey = hashQueryKey(pathAndArgs);
    const client = useContext().client;

    return useEffect(() => {
      if (!enabled) {
        return;
      }
      let stopped = false;
      const [path, input] = pathAndArgs;
      const promise = client.subscriptionOnce(path, input);
      promise
        .then((data) => {
          if (stopped) {
            return;
          }
          opts?.onBatch && opts.onBatch(data);
        })
        .catch((err) => {
          if (stopped) {
            return;
          }
          opts?.onError && opts.onError(err);
        });
      return () => {
        stopped = true;
        promise.cancel();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryKey, enabled]);
  }
  /* istanbul ignore next */
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  function useLiveQuery<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferProcedureInput<TSubscriptions[TPath]> & { cursor: any },
    TOutput extends (inferSubscriptionOutput<TRouter, TPath> &
      OutputWithCursor<TData>)[],
    TData
  >(
    pathAndArgs: [TPath, Omit<TInput, 'cursor'>],
    opts?: Omit<UseQueryOptions<TInput, TError, TOutput>, 'select'>,
  ) {
    const [path, userInput] = pathAndArgs;

    const currentCursor = useRef<any>(null);
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_LIVE_QUERY);
    const client = useContext().client;

    const hook = useQuery<TInput, TError, TOutput>(
      cacheKey,
      () =>
        (client.subscriptionOnce as any)(path, {
          ...userInput,
          cursor: currentCursor.current,
        }) as any,
      opts,
    );
    const lastItem = useMemo(() => {
      const raw = hook.data;
      if (typeof raw === 'undefined') {
        return undefined;
      }
      const last = raw[raw.length - 1];
      return last;
    }, [hook.data]);

    const data: TOutput[number]['data'] | undefined = lastItem?.data;
    const lastCursor = lastItem?.cursor;

    useEffect(() => {
      currentCursor.current = lastCursor;
      hook.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastCursor]);

    return { ...hook, data };
  }

  function _useInfiniteQuery<
    TPath extends keyof TQueries & string,
    TInput extends inferProcedureInput<TQueries[TPath]> & { cursor: TCursor },
    TOutput extends inferProcedureOutput<TQueries[TPath]>,
    TCursor extends any
  >(
    pathAndArgs: [TPath, Omit<TInput, 'cursor'>],
    // FIXME: this typing is wrong but it works
    opts?: UseInfiniteQueryOptions<TOutput, TError, TOutput, TOutput>,
  ) {
    const { client, queryClient, prefetchInfiniteQuery } = useContext();
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_INFINITE_QUERY);
    const [path, input] = pathAndArgs;

    if (typeof window === 'undefined' && ssr) {
      const hashed = hashQueryKey(cacheKey);
      const cache = queryClient.getQueryCache().get(hashed);
      if (!cache) {
        const actualInput = { ...input, cursor: null };
        prefetchInfiniteQuery([path, actualInput] as any);
      }
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
    dehydratedState: DehydratedState | undefined,
  ) {
    const transformed: DehydratedState | undefined = useMemo(() => {
      if (!dehydratedState) {
        return dehydratedState;
      }

      return client.transformer.deserialize(dehydratedState);
    }, [client, dehydratedState]);
    return transformed;
  }

  return {
    Provider: TRPCProvider,
    createClient,
    useContext: useContext,
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscription,
    useLiveQuery,
    useDehydratedState,
    useInfiniteQuery: _useInfiniteQuery,
    ssr,
  };
}
