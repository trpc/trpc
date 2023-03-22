/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
import { TRPCClientErrorLike, createTRPCClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { Observable } from '@trpc/server/observable';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SSRState, TRPCContext } from '../../internals/context';
import { TRPCContextState } from '../../internals/context';
import { QueryType, getArrayQueryKey } from '../../internals/getArrayQueryKey';
import { getClientArgs } from '../../internals/getClientArgs';
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
              return queryClient.fetchQuery({
                ...opts,
                queryKey: getArrayQueryKey(pathAndInput, 'query'),
                queryFn: () =>
                  (client as any).query(...getClientArgs(pathAndInput, opts)),
              });
            },
            [client, queryClient],
          ),
          fetchInfiniteQuery: useCallback(
            (pathAndInput, opts) => {
              return queryClient.fetchInfiniteQuery({
                ...opts,
                queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
                queryFn: ({ pageParam }) => {
                  const [path, input] = pathAndInput;
                  const actualInput = { ...input, cursor: pageParam };
                  return (client as any).query(
                    ...getClientArgs([path, actualInput], opts),
                  );
                },
              });
            },
            [client, queryClient],
          ),
          prefetchQuery: useCallback(
            (pathAndInput, opts) => {
              return queryClient.prefetchQuery({
                ...opts,
                queryKey: getArrayQueryKey(pathAndInput, 'query'),
                queryFn: () =>
                  (client as any).query(...getClientArgs(pathAndInput, opts)),
              });
            },
            [client, queryClient],
          ),
          prefetchInfiniteQuery: useCallback(
            (pathAndInput, opts) => {
              return queryClient.prefetchInfiniteQuery({
                ...opts,
                queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
                queryFn: ({ pageParam }) => {
                  const [path, input] = pathAndInput;
                  const actualInput = { ...input, cursor: pageParam };
                  return (client as any).query(
                    ...getClientArgs([path, actualInput], opts),
                  );
                },
              });
            },
            [client, queryClient],
          ),
          ensureQueryData: useCallback(
            (pathAndInput, opts) => {
              return queryClient.ensureQueryData({
                ...opts,
                queryKey: getArrayQueryKey(pathAndInput, 'query'),
                queryFn: () =>
                  (client as any).query(...getClientArgs(pathAndInput, opts)),
              });
            },
            [client, queryClient],
          ),
          invalidateQueries: useCallback(
            (queryKey, filters, options) => {
              return queryClient.invalidateQueries(
                {
                  ...filters,
                  queryKey: getArrayQueryKey(queryKey as any, 'any'),
                },
                options,
              );
            },
            [queryClient],
          ),
          resetQueries: useCallback(
            (...args: any[]) => {
              const [queryKey, filters, options] = args;

              return queryClient.resetQueries(
                {
                  ...filters,
                  queryKey: getArrayQueryKey(queryKey, 'any'),
                },
                options,
              );
            },
            [queryClient],
          ),
          refetchQueries: useCallback(
            (...args: any[]) => {
              const [queryKey, filters, options] = args;

              return queryClient.refetchQueries(
                {
                  ...filters,
                  queryKey: getArrayQueryKey(queryKey, 'any'),
                },
                options,
              );
            },
            [queryClient],
          ),
          cancelQuery: useCallback(
            (pathAndInput) => {
              return queryClient.cancelQueries({
                queryKey: getArrayQueryKey(pathAndInput, 'any'),
              });
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

  function useQuery(
    // FIXME path should be a tuple in next major
    pathAndInput: [path: string, ...args: unknown[]],
    opts?: UseTRPCQueryOptions<unknown, unknown, unknown, unknown, TError>,
  ): UseTRPCQueryResult<unknown, TError> {
    const context = useContext();
    if (!context) {
      throw new Error(
        'Unable to retrieve application context. Did you forget to wrap your App inside `withTRPC` HoC?',
      );
    }
    const { abortOnUnmount, client, ssrState, queryClient, prefetchQuery } =
      context;

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

    const shouldAbortOnUnmount =
      opts?.trpc?.abortOnUnmount ?? config?.abortOnUnmount ?? abortOnUnmount;

    const hook = __useQuery({
      ...ssrOpts,
      queryKey: getArrayQueryKey(pathAndInput, 'query') as any,
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

        return (client as any).query(
          ...getClientArgs(pathAndInput, actualOpts),
        );
      },
      context: ReactQueryContext,
    }) as UseTRPCQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      path: pathAndInput[0],
    });

    return hook;
  }

  function useMutation(
    // FIXME: this should only be a tuple path in next major
    path: string | [string],
    opts?: UseTRPCMutationOptions<unknown, TError, unknown, unknown>,
  ): UseTRPCMutationResult<unknown, TError, unknown, unknown> {
    const { client } = useContext();
    const queryClient = useQueryClient({ context: ReactQueryContext });
    const actualPath = Array.isArray(path) ? path[0] : path;

    const hook = __useMutation({
      ...opts,
      mutationKey: [actualPath.split('.')],
      mutationFn: (input) => {
        return (client.mutation as any)(
          ...getClientArgs([actualPath, input], opts),
        );
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
      path: actualPath,
    });

    return hook;
  }

  /* istanbul ignore next -- @preserve */
  function useSubscription(
    pathAndInput: [
      // FIXME: tuple me in next major
      path: string,
      ...args: unknown[],
    ],
    opts: UseTRPCSubscriptionOptions<Observable<unknown, unknown>, TError>,
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
      const subscription = client.subscription(
        path,
        (input ?? undefined) as any,
        {
          onStarted: () => {
            if (!isStopped) {
              opts.onStarted?.();
            }
          },
          onData: (data) => {
            if (!isStopped) {
              // FIXME this shouldn't be needed as both should be `unknown` in next major
              opts.onData(data as any);
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
    pathAndInput: [
      // FIXME tuple in next major
      path: string,
      input: Record<any, unknown>,
    ],
    opts?: UseTRPCInfiniteQueryOptions<unknown, unknown, unknown, TError>,
  ): UseTRPCInfiniteQueryResult<unknown, TError> {
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

    const hook = __useInfiniteQuery({
      ...ssrOpts,
      queryKey: getArrayQueryKey(pathAndInput, 'infinite') as any,
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
          cursor: queryFunctionContext.pageParam ?? opts?.initialCursor,
        };

        // FIXME as any shouldn't be needed as client should be untyped too
        return (client as any).query(
          ...getClientArgs([path, actualInput], actualOpts),
        );
      },
      context: ReactQueryContext,
    }) as UseTRPCInfiniteQueryResult<unknown, TError>;

    hook.trpc = useHookResult({
      path,
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
          !queryClient
            .getQueryCache()
            .find(getArrayQueryKey(queryOption.queryKey!, 'query'))
        ) {
          void prefetchQuery(queryOption.queryKey as any, queryOption as any);
        }
      }
    }

    return __useQueries({
      queries: queries.map((query) => ({
        ...query,
        queryKey: getArrayQueryKey(query.queryKey, 'query'),
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
