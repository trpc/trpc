// TODO: Look into fixing react-compiler support
/* eslint-disable react-hooks/react-compiler */
import {
  useInfiniteQuery as __useInfiniteQuery,
  useMutation as __useMutation,
  usePrefetchInfiniteQuery as __usePrefetchInfiniteQuery,
  useQueries as __useQueries,
  useQuery as __useQuery,
  useSuspenseInfiniteQuery as __useSuspenseInfiniteQuery,
  useSuspenseQueries as __useSuspenseQueries,
  useSuspenseQuery as __useSuspenseQuery,
  usePrefetchQuery as _usePrefetchQuery,
  hashKey,
  skipToken,
} from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import {
  createTRPCClient,
  getUntypedClient,
  TRPCUntypedClient,
} from '@trpc/client';
import type { Unsubscribable } from '@trpc/server/observable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import { isAsyncIterable } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import type { SSRState, TRPCContextState } from '../../internals/context';
import { TRPCContext } from '../../internals/context';
import { getClientArgs } from '../../internals/getClientArgs';
import type { TRPCQueryKey } from '../../internals/getQueryKey';
import {
  getMutationKeyInternal,
  getQueryKeyInternal,
} from '../../internals/getQueryKey';
import {
  buildQueryFromAsyncIterable,
  useHookResult,
} from '../../internals/trpcResult';
import type {
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from '../../internals/useQueries';
import { createUtilityFunctions } from '../../utils/createUtilityFunctions';
import { createUseQueries } from '../proxy/useQueriesProxy';
import type { CreateTRPCReactOptions, UseMutationOverride } from '../types';
import type {
  TRPCProvider,
  TRPCQueryOptions,
  TRPCSubscriptionConnectingResult,
  TRPCSubscriptionIdleResult,
  TRPCSubscriptionResult,
  UseTRPCInfiniteQueryOptions,
  UseTRPCInfiniteQueryResult,
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCPrefetchInfiniteQueryOptions,
  UseTRPCPrefetchQueryOptions,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSubscriptionOptions,
  UseTRPCSuspenseInfiniteQueryOptions,
  UseTRPCSuspenseInfiniteQueryResult,
  UseTRPCSuspenseQueryOptions,
  UseTRPCSuspenseQueryResult,
} from './types';

const trackResult = <T extends object>(
  result: T,
  onTrackResult: (key: keyof T) => void,
): T => {
  const trackedResult = new Proxy(result, {
    get(target, prop) {
      onTrackResult(prop as keyof T);
      return target[prop as keyof T];
    },
  });

  return trackedResult;
};

/**
 * @internal
 */
export function createRootHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(config?: CreateTRPCReactOptions<TRouter>) {
  const mutationSuccessOverride: UseMutationOverride['onSuccess'] =
    config?.overrides?.useMutation?.onSuccess ??
    ((options) => options.originalFn());

  type TError = TRPCClientErrorLike<TRouter>;

  type ProviderContext = TRPCContextState<TRouter, TSSRContext>;

  const Context = (config?.context ??
    TRPCContext) as React.Context<ProviderContext>;

  const createClient = createTRPCClient<TRouter>;

  const TRPCProvider: TRPCProvider<TRouter, TSSRContext> = (props) => {
    const { abortOnUnmount = false, queryClient, ssrContext } = props;
    const [ssrState, setSSRState] = React.useState<SSRState>(
      props.ssrState ?? false,
    );

    const client: TRPCUntypedClient<TRouter> =
      props.client instanceof TRPCUntypedClient
        ? props.client
        : getUntypedClient(props.client);

    const fns = React.useMemo(
      () =>
        createUtilityFunctions({
          client,
          queryClient,
        }),
      [client, queryClient],
    );

    const contextValue = React.useMemo<ProviderContext>(
      () => ({
        abortOnUnmount,
        queryClient,
        client,
        ssrContext: ssrContext ?? null,
        ssrState,
        ...fns,
      }),
      [abortOnUnmount, client, fns, queryClient, ssrContext, ssrState],
    );

    React.useEffect(() => {
      // Only updating state to `mounted` if we are using SSR.
      // This makes it so we don't have an unnecessary re-render when opting out of SSR.
      setSSRState((state) => (state ? 'mounted' : false));
    }, []);
    return (
      <Context.Provider value={contextValue}>{props.children}</Context.Provider>
    );
  };

  function useContext() {
    const context = React.useContext(Context);

    if (!context) {
      throw new Error(
        'Unable to find tRPC Context. Did you forget to wrap your App inside `withTRPC` HoC?',
      );
    }
    return context;
  }

  /**
   * Hack to make sure errors return `status`='error` when doing SSR
   * @see https://github.com/trpc/trpc/pull/1645
   */
  function useSSRQueryOptionsIfNeeded<
    TOptions extends { retryOnMount?: boolean } | undefined,
  >(queryKey: TRPCQueryKey, opts: TOptions): TOptions {
    const { queryClient, ssrState } = useContext();
    return ssrState &&
      ssrState !== 'mounted' &&
      queryClient.getQueryCache().find({ queryKey })?.state.status === 'error'
      ? {
          retryOnMount: false,
          ...opts,
        }
      : opts;
  }

  function useQuery(
    path: readonly string[],
    input: unknown,
    opts?: UseTRPCQueryOptions<unknown, unknown, TError>,
  ): UseTRPCQueryResult<unknown, TError> {
    const context = useContext();
    const { abortOnUnmount, client, ssrState, queryClient, prefetchQuery } =
      context;
    const queryKey = getQueryKeyInternal(path, input, 'query');

    const defaultOpts = queryClient.getQueryDefaults(queryKey);

    const isInputSkipToken = input === skipToken;

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      (opts?.enabled ?? defaultOpts?.enabled) !== false &&
      !isInputSkipToken &&
      !queryClient.getQueryCache().find({ queryKey })
    ) {
      void prefetchQuery(queryKey, opts as any);
    }
    const ssrOpts = useSSRQueryOptionsIfNeeded(queryKey, {
      ...defaultOpts,
      ...opts,
    });

    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ?? config?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useQuery(
      {
        ...ssrOpts,
        queryKey: queryKey as any,
        queryFn: isInputSkipToken
          ? input
          : async (queryFunctionContext) => {
              const actualOpts = {
                ...ssrOpts,
                trpc: {
                  ...ssrOpts?.trpc,
                  ...(shouldAbortOnUnmount
                    ? { signal: queryFunctionContext.signal }
                    : { signal: null }),
                },
              };

              const result = await client.query(
                ...getClientArgs(queryKey, actualOpts),
              );

              if (isAsyncIterable(result)) {
                return buildQueryFromAsyncIterable(
                  result,
                  queryClient,
                  queryKey,
                );
              }
              return result;
            },
      },
      queryClient,
    ) as UseTRPCQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      path,
    });

    return hook;
  }

  function usePrefetchQuery(
    path: string[],
    input: unknown,
    opts?: UseTRPCPrefetchQueryOptions<unknown, unknown, TError>,
  ): void {
    const context = useContext();
    const queryKey = getQueryKeyInternal(path, input, 'query');

    const isInputSkipToken = input === skipToken;

    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ??
      config?.abortOnUnmount ??
      context.abortOnUnmount;

    _usePrefetchQuery({
      ...opts,
      queryKey: queryKey as any,
      queryFn: isInputSkipToken
        ? input
        : (queryFunctionContext) => {
            const actualOpts = {
              trpc: {
                ...opts?.trpc,
                ...(shouldAbortOnUnmount
                  ? { signal: queryFunctionContext.signal }
                  : {}),
              },
            };

            return context.client.query(...getClientArgs(queryKey, actualOpts));
          },
    });
  }

  function useSuspenseQuery(
    path: readonly string[],
    input: unknown,
    opts?: UseTRPCSuspenseQueryOptions<unknown, unknown, TError>,
  ): UseTRPCSuspenseQueryResult<unknown, TError> {
    const context = useContext();
    const queryKey = getQueryKeyInternal(path, input, 'query');

    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ??
      config?.abortOnUnmount ??
      context.abortOnUnmount;

    const hook = __useSuspenseQuery(
      {
        ...opts,
        queryKey: queryKey as any,
        queryFn: (queryFunctionContext) => {
          const actualOpts = {
            ...opts,
            trpc: {
              ...opts?.trpc,
              ...(shouldAbortOnUnmount
                ? { signal: queryFunctionContext.signal }
                : { signal: null }),
            },
          };

          return context.client.query(...getClientArgs(queryKey, actualOpts));
        },
      },
      context.queryClient,
    ) as UseTRPCQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      path,
    });

    return [hook.data, hook as any];
  }

  function useMutation(
    path: readonly string[],
    opts?: UseTRPCMutationOptions<unknown, TError, unknown, unknown>,
  ): UseTRPCMutationResult<unknown, TError, unknown, unknown> {
    const { client, queryClient } = useContext();

    const mutationKey = getMutationKeyInternal(path);

    const defaultOpts = queryClient.defaultMutationOptions(
      queryClient.getMutationDefaults(mutationKey),
    );

    const hook = __useMutation(
      {
        ...opts,
        mutationKey: mutationKey,
        mutationFn: (input) => {
          return client.mutation(...getClientArgs([path, { input }], opts));
        },
        onSuccess(...args) {
          const originalFn = () =>
            opts?.onSuccess?.(...args) ?? defaultOpts?.onSuccess?.(...args);

          return mutationSuccessOverride({
            originalFn,
            queryClient,
            meta: opts?.meta ?? defaultOpts?.meta ?? {},
          });
        },
      },
      queryClient,
    ) as UseTRPCMutationResult<unknown, TError, unknown, unknown>;

    hook.trpc = useHookResult({
      path,
    });

    return hook;
  }
  const initialStateIdle: Omit<TRPCSubscriptionIdleResult<unknown>, 'reset'> = {
    data: undefined,
    error: null,
    status: 'idle',
  };

  const initialStateConnecting: Omit<
    TRPCSubscriptionConnectingResult<unknown, TError>,
    'reset'
  > = {
    data: undefined,
    error: null,
    status: 'connecting',
  };

  /* istanbul ignore next -- @preserve */
  function useSubscription(
    path: readonly string[],
    input: unknown,
    opts: UseTRPCSubscriptionOptions<unknown, TError>,
  ) {
    const enabled = opts?.enabled ?? input !== skipToken;
    const queryKey = hashKey(getQueryKeyInternal(path, input, 'any'));
    const { client } = useContext();

    const optsRef = React.useRef<typeof opts>(opts);
    React.useEffect(() => {
      optsRef.current = opts;
    });

    type $Result = TRPCSubscriptionResult<unknown, TError>;

    const [trackedProps] = React.useState(new Set<keyof $Result>([]));

    const addTrackedProp = React.useCallback(
      (key: keyof $Result) => {
        trackedProps.add(key);
      },
      [trackedProps],
    );

    const currentSubscriptionRef = React.useRef<Unsubscribable>(null);

    const updateState = React.useCallback(
      (callback: (prevState: $Result) => $Result) => {
        const prev = resultRef.current;
        const next = (resultRef.current = callback(prev));

        let shouldUpdate = false;
        for (const key of trackedProps) {
          if (prev[key] !== next[key]) {
            shouldUpdate = true;
            break;
          }
        }
        if (shouldUpdate) {
          setState(trackResult(next, addTrackedProp));
        }
      },
      [addTrackedProp, trackedProps],
    );

    const reset = React.useCallback((): void => {
      // unsubscribe from the previous subscription
      currentSubscriptionRef.current?.unsubscribe();

      if (!enabled) {
        updateState(() => ({ ...initialStateIdle, reset }));
        return;
      }
      updateState(() => ({ ...initialStateConnecting, reset }));
      const subscription = client.subscription(
        path.join('.'),
        input ?? undefined,
        {
          onStarted: () => {
            optsRef.current.onStarted?.();
            updateState((prev) => ({
              ...prev,
              status: 'pending',
              error: null,
            }));
          },
          onData: (data) => {
            optsRef.current.onData?.(data);
            updateState((prev) => ({
              ...prev,
              status: 'pending',
              data,
              error: null,
            }));
          },
          onError: (error) => {
            optsRef.current.onError?.(error);
            updateState((prev) => ({
              ...prev,
              status: 'error',
              error,
            }));
          },
          onConnectionStateChange: (result) => {
            updateState((prev) => {
              switch (result.state) {
                case 'idle':
                  return {
                    ...prev,
                    status: result.state,
                    error: null,
                    data: undefined,
                  };
                case 'connecting':
                  return {
                    ...prev,
                    error: result.error,
                    status: result.state,
                  };

                case 'pending':
                  // handled when data is / onStarted
                  return prev;
              }
            });
          },
          onComplete: () => {
            optsRef.current.onComplete?.();

            // In the case of WebSockets, the connection might not be idle so `onConnectionStateChange` will not be called until the connection is closed.
            // In this case, we need to set the state to idle manually.
            updateState((prev) => ({
              ...prev,
              status: 'idle',
              error: null,
              data: undefined,
            }));

            // (We might want to add a `connectionState` to the state to track the connection state separately)
          },
        },
      );

      currentSubscriptionRef.current = subscription;

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, queryKey, enabled, updateState]);
    React.useEffect(() => {
      reset();

      return () => {
        currentSubscriptionRef.current?.unsubscribe();
      };
    }, [reset]);

    const resultRef = React.useRef<$Result>(
      enabled
        ? { ...initialStateConnecting, reset }
        : { ...initialStateIdle, reset },
    );

    const [state, setState] = React.useState<$Result>(
      trackResult(resultRef.current, addTrackedProp),
    );

    return state;
  }

  function useInfiniteQuery(
    path: readonly string[],
    input: unknown,
    opts: UseTRPCInfiniteQueryOptions<unknown, unknown, TError>,
  ): UseTRPCInfiniteQueryResult<unknown, TError, unknown> {
    const {
      client,
      ssrState,
      prefetchInfiniteQuery,
      queryClient,
      abortOnUnmount,
    } = useContext();
    const queryKey = getQueryKeyInternal(path, input, 'infinite');

    const defaultOpts = queryClient.getQueryDefaults(queryKey);

    const isInputSkipToken = input === skipToken;

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      (opts?.enabled ?? defaultOpts?.enabled) !== false &&
      !isInputSkipToken &&
      !queryClient.getQueryCache().find({ queryKey })
    ) {
      void prefetchInfiniteQuery(queryKey, { ...defaultOpts, ...opts } as any);
    }

    const ssrOpts = useSSRQueryOptionsIfNeeded(queryKey, {
      ...defaultOpts,
      ...opts,
    });

    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useInfiniteQuery(
      {
        ...ssrOpts,
        initialPageParam: opts.initialCursor ?? null,
        persister: opts.persister,
        queryKey: queryKey as any,
        queryFn: isInputSkipToken
          ? input
          : (queryFunctionContext) => {
              const actualOpts = {
                ...ssrOpts,
                trpc: {
                  ...ssrOpts?.trpc,
                  ...(shouldAbortOnUnmount
                    ? { signal: queryFunctionContext.signal }
                    : { signal: null }),
                },
              };

              return client.query(
                ...getClientArgs(queryKey, actualOpts, {
                  pageParam:
                    queryFunctionContext.pageParam ?? opts.initialCursor,
                  direction: queryFunctionContext.direction,
                }),
              );
            },
      },
      queryClient,
    ) as UseTRPCInfiniteQueryResult<unknown, TError, unknown>;

    hook.trpc = useHookResult({
      path,
    });
    return hook;
  }

  function usePrefetchInfiniteQuery(
    path: string[],
    input: unknown,
    opts: UseTRPCPrefetchInfiniteQueryOptions<unknown, unknown, TError>,
  ): void {
    const context = useContext();
    const queryKey = getQueryKeyInternal(path, input, 'infinite');

    const defaultOpts = context.queryClient.getQueryDefaults(queryKey);

    const isInputSkipToken = input === skipToken;

    const ssrOpts = useSSRQueryOptionsIfNeeded(queryKey, {
      ...defaultOpts,
      ...opts,
    });

    // request option should take priority over global
    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ?? context.abortOnUnmount;

    __usePrefetchInfiniteQuery({
      ...opts,
      initialPageParam: opts.initialCursor ?? null,
      queryKey,
      queryFn: isInputSkipToken
        ? input
        : (queryFunctionContext) => {
            const actualOpts = {
              ...ssrOpts,
              trpc: {
                ...ssrOpts?.trpc,
                ...(shouldAbortOnUnmount
                  ? { signal: queryFunctionContext.signal }
                  : {}),
              },
            };

            return context.client.query(
              ...getClientArgs(queryKey, actualOpts, {
                pageParam: queryFunctionContext.pageParam ?? opts.initialCursor,
                direction: queryFunctionContext.direction,
              }),
            );
          },
    });
  }

  function useSuspenseInfiniteQuery(
    path: readonly string[],
    input: unknown,
    opts: UseTRPCSuspenseInfiniteQueryOptions<unknown, unknown, TError>,
  ): UseTRPCSuspenseInfiniteQueryResult<unknown, TError, unknown> {
    const context = useContext();
    const queryKey = getQueryKeyInternal(path, input, 'infinite');

    const defaultOpts = context.queryClient.getQueryDefaults(queryKey);

    const ssrOpts = useSSRQueryOptionsIfNeeded(queryKey, {
      ...defaultOpts,
      ...opts,
    });

    // request option should take priority over global
    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ?? context.abortOnUnmount;

    const hook = __useSuspenseInfiniteQuery(
      {
        ...opts,
        initialPageParam: opts.initialCursor ?? null,
        queryKey,
        queryFn: (queryFunctionContext) => {
          const actualOpts = {
            ...ssrOpts,
            trpc: {
              ...ssrOpts?.trpc,
              ...(shouldAbortOnUnmount
                ? { signal: queryFunctionContext.signal }
                : {}),
            },
          };

          return context.client.query(
            ...getClientArgs(queryKey, actualOpts, {
              pageParam: queryFunctionContext.pageParam ?? opts.initialCursor,
              direction: queryFunctionContext.direction,
            }),
          );
        },
      },
      context.queryClient,
    ) as UseTRPCInfiniteQueryResult<unknown, TError, unknown>;

    hook.trpc = useHookResult({
      path,
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return [hook.data!, hook as any];
  }

  const useQueries: TRPCUseQueries<TRouter> = (queriesCallback, options) => {
    const { ssrState, queryClient, prefetchQuery, client } = useContext();

    const proxy = createUseQueries(client);

    const queries = queriesCallback(proxy);

    if (typeof window === 'undefined' && ssrState === 'prepass') {
      for (const query of queries) {
        const queryOption = query as TRPCQueryOptions<any, any>;
        if (
          queryOption.trpc?.ssr !== false &&
          !queryClient.getQueryCache().find({ queryKey: queryOption.queryKey })
        ) {
          void prefetchQuery(queryOption.queryKey, queryOption as any);
        }
      }
    }

    return __useQueries(
      {
        queries: queries.map((query) => ({
          ...query,
          queryKey: (query as TRPCQueryOptions<any, any>).queryKey,
        })),
        combine: options?.combine as any,
      },
      queryClient,
    );
  };

  const useSuspenseQueries: TRPCUseSuspenseQueries<TRouter> = (
    queriesCallback,
  ) => {
    const { queryClient, client } = useContext();

    const proxy = createUseQueries(client);

    const queries = queriesCallback(proxy);

    const hook = __useSuspenseQueries(
      {
        queries: queries.map((query) => ({
          ...query,
          queryFn: query.queryFn,
          queryKey: (query as TRPCQueryOptions<any, any>).queryKey,
        })),
      },
      queryClient,
    );

    return [hook.map((h) => h.data), hook] as any;
  };

  return {
    Provider: TRPCProvider,
    createClient,
    useContext,
    useUtils: useContext,
    useQuery,
    usePrefetchQuery,
    useSuspenseQuery,
    useQueries,
    useSuspenseQueries,
    useMutation,
    useSubscription,
    useInfiniteQuery,
    usePrefetchInfiniteQuery,
    useSuspenseInfiniteQuery,
  };
}

/**
 * Infer the type of a `createReactQueryHooks` function
 * @internal
 */
export type CreateReactQueryHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
> = ReturnType<typeof createRootHooks<TRouter, TSSRContext>>;
