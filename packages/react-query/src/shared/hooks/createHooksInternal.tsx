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
import { QueryType, getQueryKey } from '../../internals/getQueryKey';
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
            (path, input, opts) => {
              return queryClient.fetchQuery({
                ...opts,
                queryKey: getQueryKey(path, input, 'query'),
                queryFn: () =>
                  client.query(...getClientArgs(path, input, opts)),
              });
            },
            [client, queryClient],
          ),
          fetchInfiniteQuery: useCallback(
            (path, input, opts) => {
              return queryClient.fetchInfiniteQuery({
                ...opts,
                queryKey: getQueryKey(path, input, 'infinite'),
                queryFn: ({ pageParam }) => {
                  const actualInput = { ...(input as any), cursor: pageParam };
                  return client.query(
                    ...getClientArgs(path, actualInput, opts),
                  );
                },
              });
            },
            [client, queryClient],
          ),
          prefetchQuery: useCallback(
            (path, input, opts) => {
              return queryClient.prefetchQuery({
                ...opts,
                queryKey: getQueryKey(path, input, 'query'),
                queryFn: () =>
                  client.query(...getClientArgs(path, input, opts)),
              });
            },
            [client, queryClient],
          ),
          prefetchInfiniteQuery: useCallback(
            (path, input, opts) => {
              return queryClient.prefetchInfiniteQuery({
                ...opts,
                queryKey: getQueryKey(path, input, 'infinite'),
                queryFn: ({ pageParam }) => {
                  const actualInput = { ...(input as any), cursor: pageParam };
                  return client.query(
                    ...getClientArgs(path, actualInput, opts),
                  );
                },
              });
            },
            [client, queryClient],
          ),
          invalidateQueries: useCallback(
            (path, input, filters, options) => {
              return queryClient.invalidateQueries(
                {
                  ...filters,
                  queryKey: getQueryKey(path, input, 'any'),
                },
                options,
              );
            },
            [queryClient],
          ),
          resetQueries: useCallback(
            (...args: any[]) => {
              const [path, input, filters, options] = args;

              return queryClient.resetQueries(
                {
                  ...filters,
                  queryKey: getQueryKey(path, input, 'any'),
                },
                options,
              );
            },
            [queryClient],
          ),
          refetchQueries: useCallback(
            (...args: any[]) => {
              const [path, input, filters, options] = args;

              return queryClient.refetchQueries(
                {
                  ...filters,
                  queryKey: getQueryKey(path, input, 'any'),
                },
                options,
              );
            },
            [queryClient],
          ),
          cancelQuery: useCallback(
            (path, input, _options) => {
              return queryClient.cancelQueries({
                queryKey: getQueryKey(path, input, 'any'),
              });
            },
            [queryClient],
          ),
          setQueryData: useCallback(
            (path, input, updater, options) => {
              return queryClient.setQueryData(
                getQueryKey(path, input, 'query'),
                updater,
                options,
              );
            },
            [queryClient],
          ),
          getQueryData: useCallback(
            // REVIEW: Should this take opts?? The types doesn't have it
            (path, input) => {
              return queryClient.getQueryData(
                getQueryKey(path, input, 'query'),
              );
            },
            [queryClient],
          ),
          setInfiniteQueryData: useCallback(
            (path, input, updater, options) => {
              return queryClient.setQueryData(
                getQueryKey(path, input, 'infinite'),
                updater,
                options,
              );
            },
            [queryClient],
          ),
          getInfiniteQueryData: useCallback(
            (path, input) => {
              return queryClient.getQueryData(
                getQueryKey(path, input, 'infinite'),
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
    path: string[],
    input: unknown,
    type: Exclude<QueryType, 'any'>,
    opts: TOptions,
  ): TOptions {
    const { queryClient, ssrState } = useContext();
    return ssrState &&
      ssrState !== 'mounted' &&
      queryClient.getQueryCache().find(getQueryKey(path, input, type))?.state
        .status === 'error'
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
    const { abortOnUnmount, client, ssrState, queryClient, prefetchQuery } =
      useContext();

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(getQueryKey(path, input, 'query'))
    ) {
      void prefetchQuery(path, input, opts as any);
    }
    const ssrOpts = useSSRQueryOptionsIfNeeded(path, input, 'query', opts);
    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useQuery({
      ...ssrOpts,
      queryKey: getQueryKey(path, input, 'query') as any,
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

        return client.query(...getClientArgs(path, input, actualOpts));
      },
      context: ReactQueryContext,
    }) as UseTRPCQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      // REVIEW: What do we want to return here?
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
      mutationFn: (input) => {
        return (client.mutation as any)(...getClientArgs(path, input, opts));
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
      // REVIEW: What do we want to return here?
      path: path.join('.'),
    });

    return hook;
  }

  /* istanbul ignore next */
  function useSubscription(
    path: string[],
    input: unknown,
    opts: UseTRPCSubscriptionOptions<unknown, TError>,
  ) {
    const enabled = opts?.enabled ?? true;
    const queryKey = hashQueryKey(getQueryKey(path, input, 'any'));
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

    if (
      typeof window === 'undefined' &&
      ssrState === 'prepass' &&
      opts?.trpc?.ssr !== false &&
      opts?.enabled !== false &&
      !queryClient.getQueryCache().find(getQueryKey(path, input, 'infinite'))
    ) {
      void prefetchInfiniteQuery(path, input, opts as any);
    }

    const ssrOpts = useSSRQueryOptionsIfNeeded(path, input, 'infinite', opts);

    // request option should take priority over global
    const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useInfiniteQuery({
      ...ssrOpts,
      queryKey: getQueryKey(path, input, 'infinite') as any,
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

        const actualInput = {
          ...((input as any) ?? {}),
          cursor: queryFunctionContext.pageParam,
        };

        return client.query(...getClientArgs(path, actualInput, actualOpts));
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
          void prefetchQuery(
            // FIXME: hacky
            query.queryKey[0],
            query.queryKey[1].input,
            queryOption as any,
          );
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
