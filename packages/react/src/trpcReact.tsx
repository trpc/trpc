import type { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  AnyRouter,
  DataTransformer,
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
  FetchQueryOptions,
  hashQueryKey,
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

export type TRPCContextState<TRouter extends AnyRouter> = {
  queryClient: QueryClient;
  client: TRPCClient<TRouter>;

  prefetchQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
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

/**
 * Takes a function that returns an instance which is stored as a ref exactly once
 */
export function useInstance<T>(obj: () => T): T {
  const ref = useRef<T>();
  if (!ref.current) {
    ref.current = obj();
  }
  return ref.current;
}

function getCacheKey<TTuple extends [string, ...unknown[]]>(
  [path, input]: TTuple,
  extras?: string,
) {
  const cacheKey = [path, input ?? null];
  if (extras) {
    cacheKey.push(extras);
  }
  return cacheKey;
}

const CACHE_KEY_INFINITE_QUERY = 'TRPC_INFINITE_QUERY' as const;
const CACHE_KEY_LIVE_QUERY = 'TRPC_LIVE_QUERY' as const;
const CACHE_KEY_QUERY = 'TRPC_QUERY' as const;

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

export function trpcReact<TRouter extends AnyRouter>() {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  type TContext = Parameters<TRouter['createCaller']>[0];
  type TError = TRPCClientError<TRouter>;

  const TRPCContext = createContext<TRPCContextState<TRouter>>({} as any);
  function TRPCProvider(props: {
    /**
     * Pass in a function that returns a react-query QueryClient.
     * Will only be called once on initialization and stored in as a ref
     */
    queryClient: () => QueryClient;
    /**
     * Pass in a function that returns a TRPCClient.
     * Will only be called once on initialization and stored in as a ref
     */
    client: () => TRPCClient<TRouter>;
    children: ReactNode;
  }) {
    const queryClient = useInstance(props.queryClient);
    const client = useInstance(props.client);
    return (
      <TRPCContext.Provider
        value={{
          queryClient,
          client,
          prefetchQuery: useCallback(
            (pathAndArgs, opts) => {
              const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_QUERY);

              return queryClient.prefetchQuery(
                cacheKey,
                () => client.query(...pathAndArgs) as any,
                opts as any,
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
        {props.children}
      </TRPCContext.Provider>
    );
  }

  function useTRPC() {
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
    const client = useTRPC().client;

    return useQuery(cacheKey, () => client.query(...pathAndArgs) as any, opts);
  }

  function _useMutation<
    TPath extends keyof TMutations & string,
    TInput extends inferProcedureInput<TMutations[TPath]>,
    TOutput extends inferProcedureOutput<TMutations[TPath]>
  >(path: TPath, opts?: UseMutationOptions<TOutput, TError, TInput>) {
    const client = useTRPC().client;
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
    const client = useTRPC().client;

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
    const client = useTRPC().client;

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

  function useDehydratedState(dehydratedState?: DehydratedState) {
    const client = useTRPC().client;
    const transformed: DehydratedState | undefined = useMemo(() => {
      if (!dehydratedState) {
        return dehydratedState;
      }

      return client.transformer.deserialize(dehydratedState);
    }, [client, dehydratedState]);
    return transformed;
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
    const client = useTRPC().client;
    const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_INFINITE_QUERY);
    const [path, input] = pathAndArgs;
    return useInfiniteQuery(
      cacheKey,
      ({ pageParam }) => {
        const actualInput = { ...input, cursor: pageParam };
        return (client.query as any)(path, actualInput);
      },
      opts,
    );
  }

  /**
   * Create functions you can use for server-side rendering / static generation
   * @param router Your app's router
   * @param ctx Context used in the calls
   */
  function ssr({
    router,
    ctx,
    queryClient = new QueryClient(),
    transformer = {
      serialize: (obj) => obj,
      deserialize: (obj) => obj,
    },
  }: {
    router: TRouter;
    ctx: TContext;
    queryClient?: QueryClient;
    transformer?: DataTransformer;
  }) {
    const caller = router.createCaller(ctx) as ReturnType<
      TRouter['createCaller']
    >;

    const prefetchQuery = async <
      TPath extends keyof TQueries & string,
      TProcedure extends TQueries[TPath]
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
      TProcedure extends TQueries[TPath]
    >(
      ...pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>]
    ) => {
      const cacheKey = getCacheKey(pathAndArgs, CACHE_KEY_INFINITE_QUERY);

      return queryClient.prefetchInfiniteQuery(cacheKey, async () => {
        const data = await caller.query(...pathAndArgs);

        return data;
      });
    };

    function _dehydrate(opts?: DehydrateOptions): DehydratedState {
      return transformer.serialize(dehydrate(queryClient, opts));
    }

    return {
      caller,
      prefetchQuery,
      prefetchInfiniteQuery,
      dehydrate: _dehydrate,
    };
  }
  return {
    Provider: TRPCProvider,
    useContext: useTRPC,
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscription,
    useLiveQuery,
    useDehydratedState,
    useInfiniteQuery: _useInfiniteQuery,
    ssr,
  };
}
