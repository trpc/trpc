/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
  createTRPCClient,
} from '@trpc/client';
import type {
  AnyRouter,
  Procedure,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DehydratedState,
  QueryClient,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  useInfiniteQuery as __useInfiniteQuery,
  useMutation as __useMutation,
  useQuery as __useQuery,
  hashQueryKey,
} from 'react-query';
import { SSRState, TRPCContext, TRPCContextState } from './internals/context';

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};

export type ProcedureRecord = Record<string, Procedure<any>>;

export interface TRPCUseQueryBaseOptions extends TRPCRequestOptions {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
}

export type { TRPCContext, TRPCContextState } from './internals/context';

export interface UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError>
  extends UseQueryOptions<TOutput, TError, TData, [TPath, TInput]>,
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

export interface UseTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext = unknown,
> extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCUseQueryBaseOptions {}

function getClientArgs<TPathAndInput extends unknown[], TOptions>(
  pathAndInput: TPathAndInput,
  opts: TOptions,
) {
  const [path, input] = pathAndInput;
  return [path, input, opts] as const;
}

type inferInfiniteQueryNames<TObj extends ProcedureRecord> = {
  [TPath in keyof TObj]: inferProcedureInput<TObj[TPath]> extends {
    cursor?: any;
  }
    ? TPath
    : never;
}[keyof TObj];

type inferProcedures<TObj extends ProcedureRecord> = {
  [TPath in keyof TObj]: {
    input: inferProcedureInput<TObj[TPath]>;
    output: inferProcedureOutput<TObj[TPath]>;
  };
};

function createHookProxy(callback: (...args: [string, ...unknown[]]) => any) {
  return new Proxy({} as any, {
    get(_, path: string) {
      function myProxy() {
        throw new Error('Faulty usage');
      }
      myProxy.use = (...args: unknown[]) => callback(path, ...args);
      return myProxy;
    },
  });
}

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

  function TRPCProvider(props: {
    queryClient: QueryClient;
    client: TRPCClient<TRouter>;
    children: ReactNode;
    ssrContext?: TSSRContext | null;
    ssrState?: SSRState;
  }) {
    const { client, queryClient, ssrContext } = props;
    const [ssrState, setSSRState] = useState<SSRState>(props.ssrState ?? false);
    useEffect(() => {
      // Only updating state to `mounted` if we are using SSR.
      // This makes it so we don't have an unnecessary re-render when opting out of SSR.
      setSSRState((state) => (state ? 'mounted' : false));
    }, []);
    return (
      <Context.Provider
        value={{
          queryClient,
          client,
          ssrContext: ssrContext || null,
          ssrState,
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
          setInfiniteQueryData: useCallback(
            (...args) => {
              return queryClient.setQueryData(...args);
            },
            [queryClient],
          ),
          getInfiniteQueryData: useCallback(
            (...args) => queryClient.getQueryData(...args),
            [queryClient],
          ),
        }}
      >
        {props.children}
      </Context.Provider>
    );
  }

  function useContext() {
    return React.useContext(Context);
  }

  /**
   * Hack to make sure errors return `status`='error` when doing SSR
   * @link https://github.com/trpc/trpc/pull/1645
   */
  function useSSRQueryOptionsIfNeeded<
    TOptions extends { retryOnMount?: boolean } | undefined,
  >(pathAndInput: unknown[], opts: TOptions): TOptions {
    const { queryClient, ssrState } = useContext();
    return ssrState &&
      ssrState !== 'mounted' &&
      queryClient.getQueryCache().find(pathAndInput)?.state.status === 'error'
      ? {
          retryOnMount: false,
          ...opts,
        }
      : opts;
  }

  function useQuery<
    TPath extends keyof TQueryValues & string,
    TQueryFnData = TQueryValues[TPath]['output'],
    TData = TQueryValues[TPath]['output'],
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TQueries[TPath]>],
    opts?: UseTRPCQueryOptions<
      TPath,
      TQueryValues[TPath]['input'],
      TQueryFnData,
      TData,
      TError
    >,
  ): UseQueryResult<TData, TError> {
    const { client, ssrState, queryClient, prefetchQuery } = useContext();

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(pathAndInput)
    ) {
      void prefetchQuery(pathAndInput as any, opts as any);
    }
    const actualOpts = useSSRQueryOptionsIfNeeded(pathAndInput, opts);

    return __useQuery(
      pathAndInput as any,
      () => (client as any).query(...getClientArgs(pathAndInput, actualOpts)),
      actualOpts,
    );
  }

  function useMutation<
    TPath extends keyof TMutationValues & string,
    TContext = unknown,
  >(
    path: TPath | [TPath],
    opts?: UseTRPCMutationOptions<
      TMutationValues[TPath]['input'],
      TError,
      TMutationValues[TPath]['output'],
      TContext
    >,
  ): UseMutationResult<
    TMutationValues[TPath]['output'],
    TError,
    TMutationValues[TPath]['input'],
    TContext
  > {
    const { client } = useContext();

    return __useMutation((input) => {
      const actualPath = Array.isArray(path) ? path[0] : path;
      return (client.mutation as any)(actualPath, input, opts);
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
      ...args: inferHandlerInput<TSubscriptions[TPath]>,
    ],
    opts: {
      enabled?: boolean;
      error?: (err: TError) => void;
      next: (data: TOutput) => void;
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
      const subscription = client.subscription<
        TRouter['_def']['subscriptions'],
        TPath,
        TOutput,
        inferProcedureInput<TRouter['_def']['subscriptions'][TPath]>
      >(path, (input ?? undefined) as any, {
        error: (err) => {
          if (!isStopped) {
            opts.error?.(err);
          }
        },
        next: (res) => {
          if (res.type === 'data' && !isStopped) {
            opts.next(res.data);
          }
        },
      });
      return () => {
        isStopped = true;
        subscription.unsubscribe();
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
    const { client, ssrState, prefetchInfiniteQuery, queryClient } =
      useContext();

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(pathAndInput)
    ) {
      void prefetchInfiniteQuery(pathAndInput as any, opts as any);
    }

    const actualOpts = useSSRQueryOptionsIfNeeded(pathAndInput, opts);

    return __useInfiniteQuery(
      pathAndInput as any,
      ({ pageParam }) => {
        const actualInput = { ...((input as any) ?? {}), cursor: pageParam };
        return (client as any).query(
          ...getClientArgs([path, actualInput], actualOpts),
        );
      },
      actualOpts,
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
    }, [trpcState, client]);
    return transformed;
  }

  // FIXME: delete or fix this
  const queries = createHookProxy((path, input, opts) =>
    useQuery([path, input] as any, opts as any),
  ) as TRouter['_def']['queries'];

  return {
    Provider: TRPCProvider,
    createClient,
    useContext,
    useQuery,
    useMutation,
    useSubscription,
    useDehydratedState,
    useInfiniteQuery,
    queries,
  };
}

/**
 * Hack to infer the type of `createReactQueryHooks`
 * @link https://stackoverflow.com/a/59072991
 */
class GnClass<TRouter extends AnyRouter, TSSRContext = unknown> {
  createReactQueryHooks() {
    return createReactQueryHooks<TRouter, TSSRContext>();
  }
}

type returnTypeInferer<T> = T extends (a: Record<string, string>) => infer U
  ? U
  : never;
type fooType<TRouter extends AnyRouter, TSSRContext = unknown> = GnClass<
  TRouter,
  TSSRContext
>['createReactQueryHooks'];

/**
 * Infer the type of a `createReactQueryHooks` function
 * @intenral
 */
export type CreateReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
> = returnTypeInferer<fooType<TRouter, TSSRContext>>;
