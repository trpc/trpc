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
import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  hashQueryKey,
  QueryClient,
  useInfiniteQuery as __useInfiniteQuery,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  useMutation as __useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery as __useQuery,
  UseQueryOptions,
  UseQueryResult,
} from 'react-query';
import { DehydratedState } from 'react-query/hydration';
import { TRPCContext, TRPCContextState } from './internals/context';
import {
  IsMountedOnClientProvider,
  useIsMountedOnClient,
} from './internals/IsMountedOnClientContext';

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

export interface TRPCUseQueryBaseOptions extends TRPCRequestOptions {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
}

export interface UseTRPCQueryOptions<TPath, TInput, TOutput, TError>
  extends UseQueryOptions<TOutput, TError, TOutput, [TPath, TInput]>,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCInfiniteQueryOptions<TPath, TInput, TOutput, TError>
  extends UseInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      TOutput,
      [TPath, TInput]
    >,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCMutationOptions<TInput, TError, TOutput>
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

export function createReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>() {
  type TQueries = TRouter['_def']['queries'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  type TError = TRPCClientErrorLike<TRouter>;
  type TInfiniteQueryNames = inferInfiniteQueryNames<TQueries>;

  type TQueryValues = inferProcedures<TRouter['_def']['queries']>;
  type TMutationValues = inferProcedures<TRouter['_def']['mutations']>;

  type ProviderContext = TRPCContextState<TRouter, TSSRContext>;
  const Context = TRPCContext as React.Context<ProviderContext>;

  function createClient(
    opts: CreateTRPCClientOptions<TRouter>,
  ): TRPCClient<TRouter> {
    return createTRPCClient(opts);
  }

  function TRPCProvider({
    client,
    queryClient,
    children,
    isPrepass = false,
    ssrContext,
    ssrEnabled = false,
  }: {
    queryClient: QueryClient;
    client: TRPCClient<TRouter>;
    children: ReactNode;
    isPrepass?: boolean;
    ssrContext?: TSSRContext | null;
    ssrEnabled?: boolean;
  }) {
    return (
      <IsMountedOnClientProvider>
        <Context.Provider
          value={{
            queryClient,
            client,
            isPrepass,
            ssrContext: ssrContext || null,
            ssrEnabled,
            fetchQuery: useCallback(
              (pathAndInput, opts) => {
                return queryClient.fetchQuery(
                  pathAndInput,
                  () =>
                    (client as any).query(...getClientArgs(pathAndInput, opts)),
                  opts,
                );
              },
              [client, queryClient],
            ),
            fetchInfiniteQuery: useCallback(
              (pathAndInput, opts) => {
                return queryClient.fetchInfiniteQuery(
                  pathAndInput,
                  ({ pageParam }) => {
                    const [path, input] = pathAndInput;
                    const actualInput = {
                      ...(input as any),
                      cursor: pageParam,
                    };
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
                return queryClient.prefetchQuery(
                  pathAndInput,
                  () =>
                    (client as any).query(...getClientArgs(pathAndInput, opts)),
                  opts,
                );
              },
              [client, queryClient],
            ),
            prefetchInfiniteQuery: useCallback(
              (pathAndInput, opts) => {
                return queryClient.prefetchInfiniteQuery(
                  pathAndInput,
                  ({ pageParam }) => {
                    const [path, input] = pathAndInput;
                    const actualInput = {
                      ...(input as any),
                      cursor: pageParam,
                    };
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
              (...args: any[]) => queryClient.invalidateQueries(...args),
              [queryClient],
            ),
            invalidateQueries: useCallback(
              (...args: any[]) => queryClient.invalidateQueries(...args),
              [queryClient],
            ),
            refetchQueries: useCallback(
              (...args: any[]) => queryClient.refetchQueries(...args),
              [queryClient],
            ),
            cancelQuery: useCallback(
              (pathAndInput) => {
                return queryClient.cancelQueries(pathAndInput);
              },
              [queryClient],
            ),
            setQueryData: useCallback(
              (...args) => queryClient.setQueryData(...args),
              [queryClient],
            ),
            getQueryData: useCallback(
              (...args) => queryClient.getQueryData(...args),
              [queryClient],
            ),
          }}
        >
          {children}
        </Context.Provider>
      </IsMountedOnClientProvider>
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
    const { client, isPrepass, queryClient, prefetchQuery, ssrEnabled } =
      useContext();

    const isServer = typeof window === 'undefined';
    const isMounted = useIsMountedOnClient();

    const _opts = { ...opts };
    if (
      isServer &&
      isPrepass &&
      opts?.ssr !== false &&
      opts?.enabled !== false
    ) {
      // Enforce suspense makes sure the query is prefetched server-side
      _opts.suspense = true;
    }
    if (!ssrEnabled && !isMounted && opts?.suspense) {
      // If SSR is disabled & we're doing a suspense'd query:
      // Enforce the query to be disabled until the app has mounted on the client when doing suspense
      _opts.enabled = false;
    }

    return __useQuery(
      pathAndInput as any,
      () => {
        return (client as any).query(...getClientArgs(pathAndInput, opts));
      },
      _opts,
    );
  }

  function useMutation<TPath extends keyof TMutationValues & string>(
    path: TPath | [TPath],
    opts?: UseTRPCMutationOptions<
      TMutationValues[TPath]['input'],
      TError,
      TMutationValues[TPath]['output']
    >,
  ): UseMutationResult<
    TMutationValues[TPath]['output'],
    TError,
    TMutationValues[TPath]['input']
  > {
    const { client } = useContext();

    return __useMutation((input) => {
      const actualPath = Array.isArray(path) ? path[0] : path;
      return (client.mutation as any)(actualPath, input);
    }, opts);
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

    if (
      typeof window === 'undefined' &&
      isPrepass &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(pathAndInput)
    ) {
      prefetchInfiniteQuery(pathAndInput as any, opts as any);
    }

    return __useInfiniteQuery(
      pathAndInput as any,
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
