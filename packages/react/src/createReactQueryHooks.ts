/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  inferRouteInput,
  inferRouteOutput,
  inferSubscriptionOutput,
  Router,
  RouteWithInput,
} from '@trpc/server';
import { useEffect, useMemo, useRef } from 'react';
import {
  FetchQueryOptions,
  QueryClient,
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  UseQueryOptions,
  UseQueryResult,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  hashQueryKey,
} from 'react-query';
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
} from 'react-query/hydration';

export type OutputWithCursor<TData, TCursor extends any = any> = {
  cursor: TCursor | null;
  data: TData;
};
export function createReactQueryHooks<
  TRouter extends Router<TContext, any, any, any>,
  TContext
>({ client, queryClient }: { client: TRPCClient; queryClient: QueryClient }) {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TSubscriptions = TRouter['_def']['subscriptions'];

  function _useQuery<
    // TODO exclude all with mandatory input from TPath
    TPath extends keyof TQueries & string,
    TOutput extends inferRouteOutput<TQueries[TPath]>
  >(
    path: TPath,
    opts?: UseQueryOptions<unknown, TRPCClientError, TOutput>,
  ): UseQueryResult<TOutput, TRPCClientError>;
  function _useQuery<
    TPath extends keyof TQueries,
    TRoute extends TQueries[TPath],
    TOutput extends inferRouteOutput<TRoute>
  >(
    pathAndArgs: [
      path: TPath,
      ...args: TRoute extends RouteWithInput<any, any, any>
        ? [inferRouteInput<TRoute>]
        : [undefined?]
    ],
    opts?: UseQueryOptions<
      inferRouteInput<TQueries[TPath]>,
      TRPCClientError,
      TOutput
    >,
  ): UseQueryResult<TOutput, TRPCClientError>;

  function _useQuery(
    pathAndArgs: [string, unknown?],
    opts?: UseQueryOptions<any, any, any>,
  ) {
    let input: unknown = null;
    let path: string;
    if (Array.isArray(pathAndArgs)) {
      path = pathAndArgs[0];
      input = pathAndArgs[1] ?? null;
    } else {
      path = pathAndArgs;
    }
    const cacheKey = [path, input];

    return useQuery(cacheKey, () => (client.query as any)(...cacheKey), opts);
  }

  function _useMutation<
    TPath extends keyof TMutations & string,
    TInput extends inferRouteInput<TMutations[TPath]>,
    TOutput extends inferRouteOutput<TMutations[TPath]>
  >(
    path: TPath,
    opts?: UseMutationOptions<TOutput, TRPCClientError, TInput>,
  ): UseMutationResult<TOutput, TRPCClientError, TInput> {
    const hook = useMutation<TOutput, TRPCClientError, TInput>(
      (input) =>
        client.request({
          type: 'mutation',
          path,
          input,
        }),
      opts,
    );

    return hook;
  }

  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  function useSubscription<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferRouteInput<TSubscriptions[TPath]>,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(
    pathAndArgs: [TPath, TInput],
    opts?: {
      enabled?: boolean;
      onError?: (err: TRPCClientError) => void;
      onBatch?: (data: TOutput[]) => void;
    },
  ) {
    const enabled = opts?.enabled ?? true;
    const queryKey = hashQueryKey(pathAndArgs);

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
    }, [queryKey]);
  }

  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  function useLiveQuery<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferRouteInput<TSubscriptions[TPath]> & { cursor: any },
    TOutput extends (inferSubscriptionOutput<TRouter, TPath> &
      OutputWithCursor<TData>)[],
    TData
  >(
    pathAndArgs: [TPath, Omit<TInput, 'cursor'>],
    opts?: Omit<UseQueryOptions<TInput, TRPCClientError, TOutput>, 'select'>,
  ) {
    const [path, userInput] = pathAndArgs;

    const currentCursor = useRef<any>(null);

    const hook = useQuery<TInput, TRPCClientError, TOutput>(
      pathAndArgs,
      () =>
        client.subscriptionOnce(path, {
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
    }, [lastCursor]);

    return { ...hook, data };
  }

  const prefetchQueryOnServer = async <
    TPath extends keyof TQueries & string,
    TInput extends inferRouteInput<TQueries[TPath]>
  >(
    router: TRouter,
    opts: {
      path: TPath;
      ctx: TContext;
      input: TInput;
    },
  ): Promise<void> => {
    const input = opts.input ?? null;
    const { path, ctx } = opts;
    const cacheKey = [path, input];

    await queryClient.prefetchQuery(cacheKey, async () => {
      const data = await router.invoke({
        target: 'queries',
        ctx,
        path,
        input,
      });

      return data;
    });
  };

  const prefetchInfiniteQueryOnServer = async <
    TPath extends keyof TQueries & string,
    TInput extends inferRouteInput<TQueries[TPath]>
  >(
    router: TRouter,
    opts: {
      path: TPath;
      ctx: TContext;
      input: TInput;
    },
  ): Promise<void> => {
    const input = opts.input ?? null;
    const { path, ctx } = opts;
    const cacheKey = [path, input];

    await queryClient.prefetchInfiniteQuery(cacheKey, async () => {
      const data = await router.invoke({
        target: 'queries',
        ctx,
        path,
        input,
      });

      return data;
    });
  };

  function prefetchQuery<
    TPath extends keyof TQueries & string,
    TInput extends inferRouteInput<TQueries[TPath]>,
    TOutput extends inferRouteOutput<TQueries[TPath]>
  >(
    pathAndArgs: [TPath, TInput],
    opts?: FetchQueryOptions<TInput, TRPCClientError, TOutput>,
  ) {
    const [path, input] = pathAndArgs;

    return queryClient.prefetchQuery(
      pathAndArgs,
      () =>
        client.request({
          type: 'query',
          path,
          input,
        }) as any,
      opts as any,
    );
  }

  function _dehydrate(opts?: DehydrateOptions): DehydratedState {
    return client.transformer.serialize(dehydrate(queryClient, opts));
  }

  function useDehydratedState(dehydratedState?: DehydratedState) {
    const transformed: DehydratedState | undefined = useMemo(() => {
      if (!dehydratedState) {
        return dehydratedState;
      }

      return client.transformer.deserialize(dehydratedState);
    }, [dehydratedState]);
    return transformed;
  }

  function _useInfiniteQuery<
    TPath extends keyof TQueries & string,
    TInput extends inferRouteInput<TQueries[TPath]> & { cursor: any },
    TOutput extends inferRouteOutput<TQueries[TPath]>
  >(
    pathAndArgs: [TPath, Omit<TInput, 'cursor'>],
    opts?: UseInfiniteQueryOptions<TInput, TRPCClientError, TOutput>,
  ): UseInfiniteQueryResult<TOutput, TRPCClientError> {
    const [path, input] = pathAndArgs;
    return useInfiniteQuery<TInput, TRPCClientError, TOutput>(
      pathAndArgs,
      ({ pageParam }) => {
        const actualInput = { ...input, cursor: pageParam };
        return client.query(path, actualInput);
      },
      opts,
    );
  }

  return {
    client,
    dehydrate: _dehydrate,
    prefetchQuery,
    prefetchQueryOnServer,
    prefetchInfiniteQueryOnServer,
    queryClient,
    useDehydratedState,
    useInfiniteQuery: _useInfiniteQuery,
    useLiveQuery,
    useMutation: _useMutation,
    useQuery: _useQuery,
    useSubscription,
  };
}
