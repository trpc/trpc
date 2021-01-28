/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  DataTransformer,
  inferRouteInput,
  inferRouteOutput,
  inferSubscriptionOutput,
  Router,
  RouteWithInput,
} from '@trpc/server';
import { useCallback, useMemo } from 'react';
import {
  QueryClient,
  QueryObserverResult,
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from 'react-query';

export function createReactQueryHooks<
  TRouter extends Router<TContext, any, any, any>,
  TContext,
  TQueryClient extends QueryClient = any
>({
  client,
  queryClient,
  transformer = {
    serialize: (data) => data,
    deserialize: (data) => data,
  },
}: {
  client: TRPCClient;
  queryClient: TQueryClient;
  transformer?: DataTransformer;
}) {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TSubscriptions = TRouter['_def']['subscriptions'];

  const serializeInput = (input: unknown): unknown =>
    typeof input !== 'undefined' ? transformer.serialize(input) : input;

  const useDeserializedData = (data: unknown) =>
    useMemo(
      () =>
        typeof data !== 'undefined' ? transformer.deserialize(data) : data,
      [data],
    );

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
  ): UseQueryResult {
    let input: unknown = null;
    let path: string;
    if (Array.isArray(pathAndArgs)) {
      path = pathAndArgs[0];
      input = pathAndArgs[1] ?? null;
    } else {
      path = pathAndArgs;
    }
    const cacheKey = [path, input];

    const hook = useQuery(
      cacheKey,
      () =>
        client.request({
          type: 'query',
          path,
          input: serializeInput(input),
        }),
      opts,
    );
    const data = useDeserializedData(hook.data);
    return {
      ...hook,
      data,
    } as any;
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
          input: serializeInput(input),
        }),
      opts,
    );

    const hookMutateAsync = hook.mutateAsync;
    const mutateAsync: typeof hook['mutateAsync'] = useCallback(
      async (...args) => {
        const orig = await hookMutateAsync(...args);

        return transformer.deserialize(orig) as any;
      },
      [hookMutateAsync],
    );
    const data = useDeserializedData(hook.data);
    return {
      ...hook,
      mutateAsync,
      data,
    };
  }

  function useSubscription<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferRouteInput<TSubscriptions[TPath]>,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(
    pathAndArgs: [TPath, TInput],
    opts?: UseQueryOptions<TInput, TRPCClientError, TOutput>,
  ) {
    const [path, input] = pathAndArgs;

    const hook = useQuery<TInput, TRPCClientError, TOutput>(
      pathAndArgs,
      () => client.subscriptionOnce(path, serializeInput(input)),
      opts,
    );
    const data = useDeserializedData(hook.data);
    return {
      ...hook,
      data,
    } as QueryObserverResult<TOutput, TRPCClientError>;
  }

  const prefetchQuery = async <
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

    return queryClient.prefetchQuery(cacheKey, async () => {
      const data = await router.invokeUntyped({
        target: 'queries',
        ctx,
        path,
        input,
      });
      return transformer.serialize(data);
    });
  };

  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscription,
    queryClient,
    prefetchQuery,
  };
}
