import {
  createTRPCClient,
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
} from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
  ProcedureRecord,
} from '@trpc/server';
import React, { ReactNode, useCallback, useEffect, useMemo } from 'react';
import {
  hashQueryKey,
  QueryClient,
  useInfiniteQuery as __useInfiniteQuery,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  useMutation as __useMutation,
  UseMutationOptions,
  useQuery as __useQuery,
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

interface UseTRPCQueryOptions<TPath, TInput, TOutput, TError>
  extends UseQueryOptions<TOutput, TError, TOutput, [TPath, TInput]>,
    TRPCUseQueryBaseOptions {}

interface UseTRPCInfiniteQueryOptions<TPath, TInput, TOutput, TError>
  extends UseInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      TOutput,
      [TPath, TInput]
    >,
    TRPCUseQueryBaseOptions {}

interface UseTRPCMutationOptions<TInput, TError, TOutput>
  extends UseMutationOptions<TOutput, TError, TInput>,
    TRPCUseQueryBaseOptions {}

function getClientArgs<TPathAndInput extends unknown[], TOptions>(
  pathAndInput: TPathAndInput,
  opts: TOptions,
) {
  const [path, input] = pathAndInput;
  return [path, input, opts] as const;
}

type inferInfiniteQueryNames<TObj extends ProcedureRecord<any, any, any, any>> =
  {
    [TPath in keyof TObj]: inferProcedureInput<TObj[TPath]> extends {
      cursor?: any;
    }
      ? TPath
      : never;
  }[keyof TObj];

type inferProcedures<TObj extends ProcedureRecord<any, any, any, any>> = {
  [TPath in keyof TObj]: {
    input: inferProcedureInput<TObj[TPath]>;
    output: inferProcedureOutput<TObj[TPath]>;
  };
};

export function createReactQueryHooks<TRouter extends AnyRouter>() {
  type TQueries = TRouter['_def']['queries'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  type TError = TRPCClientErrorLike<TRouter>;
  type TInfiniteQueryNames = inferInfiniteQueryNames<TQueries>;

  type TQueryValues = inferProcedures<TRouter['_def']['queries']>;
  type TMutationValues = inferProcedures<TRouter['_def']['mutations']>;

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
                () =>
                  (client as any).query(...getClientArgs(pathAndInput, opts)),
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
                ({ pageParam }) => {
                  const [path, input] = pathAndInput;
                  const actualInput = { ...(input as any), cursor: pageParam };
                  return (client as any).query(
                    ...getClientArgs([path, actualInput], opts),
                  );
                },
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
                () =>
                  (client as any).query(...getClientArgs(pathAndInput, opts)),
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
                ({ pageParam }) => {
                  const [path, input] = pathAndInput;
                  const actualInput = { ...(input as any), cursor: pageParam };
                  return (client as any).query(
                    ...getClientArgs([path, actualInput], opts),
                  );
                },
                opts,
              );
            },
            [client, queryClient],
          ),
          /**
           * @deprecated use `invalidateQueries`
           */
          invalidateQuery: useCallback(
            (pathAndInput) => {
              return queryClient.invalidateQueries(pathAndInput);
            },
            [queryClient],
          ),
          invalidateQueries: useCallback(
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

  function useQuery<TPath extends keyof TQueryValues & string>(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TQueries[TPath]>],
    opts?: UseTRPCQueryOptions<
      TPath,
      TQueryValues[TPath]['input'],
      TQueryValues[TPath]['output'],
      TError
    >,
  ): UseQueryResult<TQueryValues[TPath]['output'], TError> {
    const cacheKey = getCacheKey(pathAndInput, CACHE_KEY_QUERY);
    const { client, isPrepass, queryClient, prefetchQuery } = useContext();

    if (
      typeof window === 'undefined' &&
      isPrepass &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(cacheKey)
    ) {
      prefetchQuery(pathAndInput as any, opts as any);
    }
    return __useQuery(
      cacheKey as any,
      () => (client as any).query(...getClientArgs(pathAndInput, opts)),
      opts,
    );
  }

  function useMutation<TPath extends keyof TMutationValues & string>(
    path: TPath,
    opts?: UseTRPCMutationOptions<
      TMutationValues[TPath]['input'],
      TError,
      TMutationValues[TPath]['output']
    >,
  ) {
    const { client } = useContext();
    return __useMutation<
      TMutationValues[TPath]['output'],
      TError,
      TMutationValues[TPath]['input']
    >((input) => (client.mutation as any)(path, input), opts);
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
    const { client } = useContext();

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

  function useInfiniteQuery<TPath extends TInfiniteQueryNames & string>(
    pathAndInput: [
      path: TPath,
      input: Omit<TQueryValues[TPath]['input'], 'cursor'>,
    ],
    opts?: UseTRPCInfiniteQueryOptions<
      TPath,
      Omit<TQueryValues[TPath]['input'], 'cursor'>,
      TQueryValues[TPath]['output'],
      TError
    >,
  ): UseInfiniteQueryResult<TQueryValues[TPath]['output'], TError> {
    const [path, input] = pathAndInput;
    const { client, isPrepass, prefetchInfiniteQuery, queryClient } =
      useContext();
    const cacheKey = getCacheKey(pathAndInput, CACHE_KEY_INFINITE_QUERY);

    if (
      typeof window === 'undefined' &&
      isPrepass &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(cacheKey)
    ) {
      prefetchInfiniteQuery(pathAndInput as any, opts as any);
    }

    return __useInfiniteQuery(
      cacheKey as any,
      ({ pageParam }) => {
        const actualInput = { ...((input as any) ?? {}), cursor: pageParam };
        return (client as any).query(
          ...getClientArgs([path, actualInput], opts),
        );
      },
      opts,
    );
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
    useContext,
    useQuery,
    useMutation,
    useSubscription,
    useDehydratedState,
    useInfiniteQuery,
  };
}
