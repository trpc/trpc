/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  DehydratedState,
  InfiniteQueryObserverSuccessResult,
  QueryClient,
  QueryObserverSuccessResult,
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
  useQueryClient,
} from '@tanstack/react-query';
import {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
  createTRPCClient,
} from '@trpc/client';
import type {
  AnyRouter,
  ProcedureRecord,
  inferHandlerInput,
  inferProcedureClientError,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import { inferObservableValue } from '@trpc/server/observable';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  SSRState,
  TRPCContext,
  TRPCContextProps,
  TRPCContextState,
} from '../../internals/context';
import { QueryType, getArrayQueryKey } from '../../internals/getArrayQueryKey';
import { CreateTRPCReactOptions, UseMutationOverride } from '../types';

export type OutputWithCursor<TData, TCursor = any> = {
  cursor: TCursor | null;
  data: TData;
};

export interface TRPCReactRequestOptions
  // For RQ, we use their internal AbortSignals instead of letting the user pass their own
  extends Omit<TRPCRequestOptions, 'signal'> {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
  /**
   * Opt out or into aborting request on unmount
   */
  abortOnUnmount?: boolean;
}

export interface TRPCUseQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

export type { TRPCContext, TRPCContextState } from '../../internals/context';

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

export interface UseTRPCSubscriptionOptions<TOutput, TError> {
  enabled?: boolean;
  onStarted?: () => void;
  onData: (data: TOutput) => void;
  onError?: (err: TError) => void;
}

function getClientArgs<TPathAndInput extends unknown[], TOptions>(
  pathAndInput: TPathAndInput,
  opts: TOptions,
) {
  const [path, input] = pathAndInput;
  return [path, input, (opts as any)?.trpc] as const;
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
    output: inferTransformedProcedureOutput<TObj[TPath]>;
  };
};

export interface TRPCProviderProps<TRouter extends AnyRouter, TSSRContext>
  extends TRPCContextProps<TRouter, TSSRContext> {
  children: ReactNode;
}

export type TRPCProvider<TRouter extends AnyRouter, TSSRContext> = (
  props: TRPCProviderProps<TRouter, TSSRContext>,
) => JSX.Element;

export type UseDehydratedState<TRouter extends AnyRouter> = (
  client: TRPCClient<TRouter>,
  trpcState: DehydratedState | undefined,
) => DehydratedState | undefined;

export type CreateClient<TRouter extends AnyRouter> = (
  opts: CreateTRPCClientOptions<TRouter>,
) => TRPCClient<TRouter>;

interface TRPCHookResult {
  trpc: {
    path: string;
  };
}

/**
 * @internal
 */
export type UseTRPCQueryResult<TData, TError> = UseQueryResult<TData, TError> &
  TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCQuerySuccessResult<TData, TError> =
  QueryObserverSuccessResult<TData, TError> & TRPCHookResult;
/**
 * @internal
 */
export type UseTRPCInfiniteQueryResult<TData, TError> = UseInfiniteQueryResult<
  TData,
  TError
> &
  TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCInfiniteQuerySuccessResult<TData, TError> =
  InfiniteQueryObserverSuccessResult<TData, TError> & TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCMutationResult<TData, TError, TVariables, TContext> =
  UseMutationResult<TData, TError, TVariables, TContext> & TRPCHookResult;

/**
 * Makes a stable reference of the `trpc` prop
 */
function useHookResult(value: TRPCHookResult['trpc']): TRPCHookResult['trpc'] {
  const ref = useRef(value);
  ref.current.path = value.path;
  return ref.current;
}
/**
 * Create strongly typed react hooks
 * @internal
 */
export function createHooksInternal<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(config?: CreateTRPCReactOptions<TRouter>) {
  const mutationSuccessOverride: UseMutationOverride['onSuccess'] =
    config?.unstable_overrides?.useMutation?.onSuccess ??
    ((options) => options.originalFn());

  type TQueries = TRouter['_def']['queries'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  type TMutations = TRouter['_def']['mutations'];

  type TError = TRPCClientErrorLike<TRouter>;
  type TInfiniteQueryNames = inferInfiniteQueryNames<TQueries>;

  type TQueryValues = inferProcedures<TQueries>;
  type TMutationValues = inferProcedures<TMutations>;

  type ProviderContext = TRPCContextState<TRouter, TSSRContext>;

  const Context = (config?.context ??
    TRPCContext) as React.Context<ProviderContext>;
  const ReactQueryContext = config?.reactQueryContext as React.Context<
    QueryClient | undefined
  >;

  const createClient: CreateClient<TRouter> = (opts) => {
    return createTRPCClient(opts);
  };

  const TRPCProvider: TRPCProvider<TRouter, TSSRContext> = (props) => {
    const { abortOnUnmount = false, client, queryClient, ssrContext } = props;
    const [ssrState, setSSRState] = useState<SSRState>(props.ssrState ?? false);
    useEffect(() => {
      // Only updating state to `mounted` if we are using SSR.
      // This makes it so we don't have an unnecessary re-render when opting out of SSR.
      setSSRState((state) => (state ? 'mounted' : false));
    }, []);
    return (
      <Context.Provider
        value={{
          abortOnUnmount,
          queryClient,
          client,
          ssrContext: ssrContext || null,
          ssrState,
          fetchQuery: useCallback(
            (pathAndInput, opts) => {
              return queryClient.fetchQuery(
                getArrayQueryKey(pathAndInput, 'query'),
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
                getArrayQueryKey(pathAndInput, 'infinite'),
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
                getArrayQueryKey(pathAndInput, 'query'),
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
                getArrayQueryKey(pathAndInput, 'infinite'),
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
            (...args: any[]) => {
              const [queryKey, ...rest] = args;

              return queryClient.invalidateQueries(
                getArrayQueryKey(queryKey, 'any'),
                ...rest,
              );
            },
            [queryClient],
          ),
          resetQueries: useCallback(
            (...args: any[]) => {
              const [queryKey, ...rest] = args;

              return queryClient.resetQueries(
                getArrayQueryKey(queryKey, 'any'),
                ...rest,
              );
            },
            [queryClient],
          ),
          refetchQueries: useCallback(
            (...args: any[]) => {
              const [queryKey, ...rest] = args;

              return queryClient.refetchQueries(
                getArrayQueryKey(queryKey, 'any'),
                ...rest,
              );
            },
            [queryClient],
          ),
          cancelQuery: useCallback(
            (pathAndInput) => {
              return queryClient.cancelQueries(
                getArrayQueryKey(pathAndInput, 'any'),
              );
            },
            [queryClient],
          ),
          setQueryData: useCallback(
            (...args) => {
              const [queryKey, ...rest] = args;
              return queryClient.setQueryData(
                getArrayQueryKey(queryKey, 'query'),
                ...rest,
              );
            },
            [queryClient],
          ),
          getQueryData: useCallback(
            (...args) => {
              const [queryKey, ...rest] = args;

              return queryClient.getQueryData(
                getArrayQueryKey(queryKey, 'query'),
                ...rest,
              );
            },
            [queryClient],
          ),
          setInfiniteQueryData: useCallback(
            (...args) => {
              const [queryKey, ...rest] = args;

              return queryClient.setQueryData(
                getArrayQueryKey(queryKey, 'infinite'),
                ...rest,
              );
            },
            [queryClient],
          ),
          getInfiniteQueryData: useCallback(
            (...args) => {
              const [queryKey, ...rest] = args;

              return queryClient.getQueryData(
                getArrayQueryKey(queryKey, 'infinite'),
                ...rest,
              );
            },
            [queryClient],
          ),
        }}
      >
        {props.children}
      </Context.Provider>
    );
  };

  function useContext() {
    return React.useContext(Context);
  }

  /**
   * Hack to make sure errors return `status`='error` when doing SSR
   * @link https://github.com/trpc/trpc/pull/1645
   */
  function useSSRQueryOptionsIfNeeded<
    TOptions extends { retryOnMount?: boolean } | undefined,
  >(
    pathAndInput: unknown[],
    type: Exclude<QueryType, 'any'>,
    opts: TOptions,
  ): TOptions {
    const { queryClient, ssrState } = useContext();
    return ssrState &&
      ssrState !== 'mounted' &&
      queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput, type))
        ?.state.status === 'error'
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
  ): UseTRPCQueryResult<TData, TError> {
    const { abortOnUnmount, client, ssrState, queryClient, prefetchQuery } =
      useContext();

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput, 'query'))
    ) {
      void prefetchQuery(pathAndInput as any, opts as any);
    }
    const ssrOpts = useSSRQueryOptionsIfNeeded(pathAndInput, 'query', opts);
    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useQuery(
      getArrayQueryKey(pathAndInput, 'query') as any,
      (queryFunctionContext) => {
        const actualOpts = {
          ...ssrOpts,
          trpc: {
            ...ssrOpts?.trpc,
            ...(shouldAbortOnUnmount
              ? { signal: queryFunctionContext.signal }
              : {}),
          },
        };

        return (client as any).query(
          ...getClientArgs(pathAndInput, actualOpts),
        );
      },
      { context: ReactQueryContext, ...ssrOpts },
    ) as UseTRPCQueryResult<TData, TError>;
    hook.trpc = useHookResult({
      path: pathAndInput[0],
    });

    return hook;
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
  ): UseTRPCMutationResult<
    TMutationValues[TPath]['output'],
    TError,
    TMutationValues[TPath]['input'],
    TContext
  > {
    const { client } = useContext();
    const queryClient = useQueryClient({ context: ReactQueryContext });

    const hook = __useMutation(
      (input) => {
        const actualPath = Array.isArray(path) ? path[0] : path;

        return (client.mutation as any)(
          ...getClientArgs([actualPath, input], opts),
        );
      },
      {
        context: ReactQueryContext,
        ...opts,
        onSuccess(...args) {
          const originalFn = () => opts?.onSuccess?.(...args);

          return mutationSuccessOverride({
            originalFn,
            queryClient,
            meta: opts?.meta ?? {},
          });
        },
      },
    ) as UseTRPCMutationResult<
      TMutationValues[TPath]['output'],
      TError,
      TMutationValues[TPath]['input'],
      TContext
    >;

    hook.trpc = useHookResult({
      path: Array.isArray(path) ? path[0] : path,
    });

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
      ...args: inferHandlerInput<TSubscriptions[TPath]>,
    ],
    opts: UseTRPCSubscriptionOptions<
      inferObservableValue<inferProcedureOutput<TSubscriptions[TPath]>>,
      inferProcedureClientError<TSubscriptions[TPath]>
    >,
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
        onStarted: () => {
          if (!isStopped) {
            opts.onStarted?.();
          }
        },
        onData: (data) => {
          if (!isStopped) {
            opts.onData(data);
          }
        },
        onError: (err) => {
          if (!isStopped) {
            opts.onError?.(err);
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
  ): UseTRPCInfiniteQueryResult<TQueryValues[TPath]['output'], TError> {
    const [path, input] = pathAndInput;
    const {
      client,
      ssrState,
      prefetchInfiniteQuery,
      queryClient,
      abortOnUnmount,
    } = useContext();

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient
        .getQueryCache()
        .find(getArrayQueryKey(pathAndInput, 'infinite'))
    ) {
      void prefetchInfiniteQuery(pathAndInput as any, opts as any);
    }

    const ssrOpts = useSSRQueryOptionsIfNeeded(pathAndInput, 'infinite', opts);

    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useInfiniteQuery(
      getArrayQueryKey(pathAndInput, 'infinite') as any,
      (queryFunctionContext) => {
        const actualOpts = {
          ...ssrOpts,
          trpc: {
            ...ssrOpts?.trpc,
            ...(shouldAbortOnUnmount
              ? { signal: queryFunctionContext.signal }
              : {}),
          },
        };

        const actualInput = {
          ...((input as any) ?? {}),
          cursor: queryFunctionContext.pageParam,
        };

        return (client as any).query(
          ...getClientArgs([path, actualInput], actualOpts),
        );
      },
      { context: ReactQueryContext, ...ssrOpts },
    ) as UseTRPCInfiniteQueryResult<TQueryValues[TPath]['output'], TError>;

    hook.trpc = useHookResult({
      path,
    });
    return hook;
  }
  const useDehydratedState: UseDehydratedState<TRouter> = (
    client,
    trpcState,
  ) => {
    const transformed: DehydratedState | undefined = useMemo(() => {
      if (!trpcState) {
        return trpcState;
      }

      return client.runtime.transformer.deserialize(trpcState);
    }, [trpcState, client]);
    return transformed;
  };

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

/**
 * Hack to infer the type of `createReactQueryHooks`
 * @link https://stackoverflow.com/a/59072991
 */
class GnClass<TRouter extends AnyRouter, TSSRContext = unknown> {
  fn() {
    return createHooksInternal<TRouter, TSSRContext>();
  }
}

type returnTypeInferer<TType> = TType extends (
  a: Record<string, string>,
) => infer U
  ? U
  : never;
type fooType<TRouter extends AnyRouter, TSSRContext = unknown> = GnClass<
  TRouter,
  TSSRContext
>['fn'];

/**
 * Infer the type of a `createReactQueryHooks` function
 * @internal
 */
export type CreateReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
> = returnTypeInferer<fooType<TRouter, TSSRContext>>;
