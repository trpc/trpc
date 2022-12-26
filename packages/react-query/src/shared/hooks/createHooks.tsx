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
import { TRPCUntypedContextState } from '../../internals/TRPCCUntypedContextState';
import { SSRState, TRPCContext } from '../../internals/context';
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
export function createHooks<TRouter extends AnyRouter, TSSRContext = unknown>(
  config?: CreateTRPCReactOptions<TRouter>,
) {
  const mutationSuccessOverride: UseMutationOverride['onSuccess'] =
    config?.unstable_overrides?.useMutation?.onSuccess ??
    ((options) => options.originalFn());

  type TError = TRPCClientErrorLike<TRouter>;

  type ProviderContext = TRPCUntypedContextState<TRouter, TSSRContext>;

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

  function useQuery(
    // FIXME path should be a tuple in next major
    pathAndInput: [path: string, ...args: unknown[]],
    opts?: UseTRPCQueryOptions<unknown, unknown, unknown, unknown, TError>,
  ): UseTRPCQueryResult<unknown, TError> {
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
    ) as UseTRPCQueryResult<unknown, TError>;
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
    ) as UseTRPCMutationResult<unknown, TError, unknown, unknown>;

    hook.trpc = useHookResult({
      path: Array.isArray(path) ? path[0] : path,
    });

    return hook;
  }

  /* istanbul ignore next */
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

        // FIXME as any shouldn't be needed as client should be untyped too
        return (client as any).query(
          ...getClientArgs([path, actualInput], actualOpts),
        );
      },
      { context: ReactQueryContext, ...ssrOpts },
    ) as UseTRPCInfiniteQueryResult<unknown, TError>;

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

/**
 * @deprecated
 * DELETE ME
 */
export * from './deprecated/createHooksInternal';
