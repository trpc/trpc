import {
  DehydratedState,
  QueryClient,
  useInfiniteQuery as __useInfiniteQuery,
  useMutation as __useMutation,
  useQueries as __useQueries,
  useQuery as __useQuery,
  hashQueryKey,
  useQueryClient,
} from '@tanstack/react-query';
import { TRPCClientErrorLike, createTRPCUntypedClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SSRState,
  TRPCContext,
  TRPCContextState,
} from '../../internals/context';
import { getClientArgs } from '../../internals/getClientArgs';
import { TRPCQueryKey, getQueryKeyInternal } from '../../internals/getQueryKey';
import { useHookResult } from '../../internals/useHookResult';
import { TRPCUseQueries } from '../../internals/useQueries';
import { createUseQueriesProxy } from '../proxy/useQueriesProxy';
import { CreateTRPCReactOptions, UseMutationOverride } from '../types';
import {
  CreateClient,
  TRPCProvider,
  TRPCQueryOptions,
  UseDehydratedState,
  UseTRPCInfiniteQueryOptions,
  UseTRPCInfiniteQueryResult,
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSubscriptionOptions,
} from './types';

/**
 * @internal
 */
export function createRootHooks<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(config?: CreateTRPCReactOptions<TRouter>) {
  const mutationSuccessOverride: UseMutationOverride['onSuccess'] =
    config?.unstable_overrides?.useMutation?.onSuccess ??
    ((options) => options.originalFn());

  type TError = TRPCClientErrorLike<TRouter>;

  type ProviderContext = TRPCContextState<TRouter, TSSRContext>;

  const Context = (config?.context ??
    TRPCContext) as React.Context<ProviderContext>;
  const ReactQueryContext = config?.reactQueryContext as React.Context<
    QueryClient | undefined
  >;

  const createClient: CreateClient<TRouter> = (opts) => {
    return createTRPCUntypedClient(opts);
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
            (queryKey, opts) => {
              return queryClient.fetchQuery({
                ...opts,
                queryKey,
                queryFn: () => client.query(...getClientArgs(queryKey, opts)),
              });
            },
            [client, queryClient],
          ),
          fetchInfiniteQuery: useCallback(
            (queryKey, opts) => {
              return queryClient.fetchInfiniteQuery({
                ...opts,
                queryKey,
                queryFn: ({ pageParam }) => {
                  return client.query(
                    ...getClientArgs(queryKey, opts, pageParam),
                  );
                },
              });
            },
            [client, queryClient],
          ),
          prefetchQuery: useCallback(
            (queryKey, opts) => {
              return queryClient.prefetchQuery({
                ...opts,
                queryKey,
                queryFn: () => client.query(...getClientArgs(queryKey, opts)),
              });
            },
            [client, queryClient],
          ),
          prefetchInfiniteQuery: useCallback(
            (queryKey, opts) => {
              return queryClient.prefetchInfiniteQuery({
                ...opts,
                queryKey,
                queryFn: ({ pageParam }) => {
                  return client.query(
                    ...getClientArgs(queryKey, opts, pageParam),
                  );
                },
              });
            },
            [client, queryClient],
          ),
          ensureQueryData: useCallback(
            (queryKey, opts) => {
              return queryClient.ensureQueryData({
                ...opts,
                queryKey,
                queryFn: () => client.query(...getClientArgs(queryKey, opts)),
              });
            },
            [client, queryClient],
          ),
          invalidateQueries: useCallback(
            (queryKey, filters, options) => {
              return queryClient.invalidateQueries(
                {
                  ...filters,
                  queryKey,
                },
                options,
              );
            },
            [queryClient],
          ),
          resetQueries: useCallback(
            (queryKey, filters, options) => {
              return queryClient.resetQueries(
                {
                  ...filters,
                  queryKey,
                },
                options,
              );
            },
            [queryClient],
          ),
          refetchQueries: useCallback(
            (queryKey, filters, options) => {
              return queryClient.refetchQueries(
                {
                  ...filters,
                  queryKey,
                },
                options,
              );
            },
            [queryClient],
          ),
          cancelQuery: useCallback(
            (queryKey, options) => {
              return queryClient.cancelQueries(
                {
                  queryKey,
                },
                options,
              );
            },
            [queryClient],
          ),
          setQueryData: useCallback(
            (queryKey, updater, options) => {
              return queryClient.setQueryData(queryKey, updater, options);
            },
            [queryClient],
          ),
          getQueryData: useCallback(
            // REVIEW: Should this take opts?? The types doesn't have it
            (queryKey) => {
              return queryClient.getQueryData(queryKey);
            },
            [queryClient],
          ),
          setInfiniteQueryData: useCallback(
            (queryKey, updater, options) => {
              return queryClient.setQueryData(queryKey, updater, options);
            },
            [queryClient],
          ),
          getInfiniteQueryData: useCallback(
            (queryKey) => {
              return queryClient.getQueryData(queryKey);
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
  >(queryKey: TRPCQueryKey, opts: TOptions): TOptions {
    const { queryClient, ssrState } = useContext();
    return ssrState &&
      ssrState !== 'mounted' &&
      queryClient.getQueryCache().find(queryKey)?.state.status === 'error'
      ? {
          retryOnMount: false,
          ...opts,
        }
      : opts;
  }

  function useQuery(
    path: string[],
    input: unknown,
    opts?: UseTRPCQueryOptions<unknown, unknown, unknown, unknown, TError>,
  ): UseTRPCQueryResult<unknown, TError> {
    const context = useContext();
    if (!context) {
      throw new Error(
        'Unable to retrieve application context. Did you forget to wrap your App inside `withTRPC` HoC?',
      );
    }
    const { abortOnUnmount, client, ssrState, queryClient, prefetchQuery } =
      useContext();
    const queryKey = getQueryKeyInternal(path, input, 'query');

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(queryKey)
    ) {
      void prefetchQuery(queryKey, opts as any);
    }
    const ssrOpts = useSSRQueryOptionsIfNeeded(queryKey, opts);
    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useQuery({
      ...ssrOpts,
      queryKey: queryKey as any,
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

        return client.query(...getClientArgs(queryKey, actualOpts));
      },
      context: ReactQueryContext,
    }) as UseTRPCQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      path: path.join('.'),
    });

    return hook;
  }

  function useMutation(
    path: string[],
    opts?: UseTRPCMutationOptions<unknown, TError, unknown, unknown>,
  ): UseTRPCMutationResult<unknown, TError, unknown, unknown> {
    const { client } = useContext();
    const queryClient = useQueryClient({ context: ReactQueryContext });

    const hook = __useMutation({
      ...opts,
      mutationKey: [path],
      mutationFn: (input) => {
        return client.mutation(...getClientArgs([path, { input }], opts));
      },
      context: ReactQueryContext,
      onSuccess(...args) {
        const originalFn = () => opts?.onSuccess?.(...args);

        return mutationSuccessOverride({
          originalFn,
          queryClient,
          meta: opts?.meta ?? {},
        });
      },
    }) as UseTRPCMutationResult<unknown, TError, unknown, unknown>;

    hook.trpc = useHookResult({
      path: path.join('.'),
    });

    return hook;
  }

  /* istanbul ignore next -- @preserve */
  function useSubscription(
    path: string[],
    input: unknown,
    opts: UseTRPCSubscriptionOptions<unknown, TError>,
  ) {
    const enabled = opts?.enabled ?? true;
    const queryKey = hashQueryKey(getQueryKeyInternal(path, input, 'any'));
    const { client } = useContext();

    return useEffect(() => {
      if (!enabled) {
        return;
      }
      let isStopped = false;
      const subscription = client.subscription(
        path.join('.'),
        input ?? undefined,
        {
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
        },
      );
      return () => {
        isStopped = true;
        subscription.unsubscribe();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryKey, enabled]);
  }

  function useInfiniteQuery(
    path: string[],
    input: unknown,
    opts?: UseTRPCInfiniteQueryOptions<unknown, unknown, unknown, TError>,
  ): UseTRPCInfiniteQueryResult<unknown, TError> {
    const {
      client,
      ssrState,
      prefetchInfiniteQuery,
      queryClient,
      abortOnUnmount,
    } = useContext();
    const queryKey = getQueryKeyInternal(path, input, 'infinite');

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(queryKey)
    ) {
      void prefetchInfiniteQuery(queryKey, opts as any);
    }

    const ssrOpts = useSSRQueryOptionsIfNeeded(queryKey, opts);

    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useInfiniteQuery({
      ...ssrOpts,
      queryKey: queryKey as any,
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

        return client.query(
          ...getClientArgs(
            queryKey,
            actualOpts,
            queryFunctionContext.pageParam ?? opts?.initialCursor,
          ),
        );
      },
      context: ReactQueryContext,
    }) as UseTRPCInfiniteQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      // REVIEW: What do we want to return here?
      path: path.join('.'),
    });
    return hook;
  }

  const useQueries: TRPCUseQueries<TRouter> = (queriesCallback, context) => {
    const { ssrState, queryClient, prefetchQuery, client } = useContext();

    const proxy = createUseQueriesProxy(client);

    const queries = queriesCallback(proxy);

    if (typeof window === 'undefined' && ssrState === 'prepass') {
      for (const query of queries) {
        const queryOption = query as TRPCQueryOptions<any, any, any, any>;
        if (
          queryOption.trpc?.ssr !== false &&
          !queryClient.getQueryCache().find(queryOption.queryKey)
        ) {
          void prefetchQuery(query.queryKey, queryOption as any);
        }
      }
    }

    return __useQueries({
      queries: queries.map((query) => ({
        ...query,
        queryKey: query.queryKey,
      })),
      context,
    }) as any;
  };

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
    useQueries,
    useMutation,
    useSubscription,
    useDehydratedState,
    useInfiniteQuery,
  };
}
/* istanbul ignore next */
/**
 * Hack to infer the type of `createReactQueryHooks`
 * @link https://stackoverflow.com/a/59072991
 */
class GnClass<TRouter extends AnyRouter, TSSRContext = unknown> {
  fn() {
    return createRootHooks<TRouter, TSSRContext>();
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
