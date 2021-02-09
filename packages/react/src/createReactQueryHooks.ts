/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  inferRouteInput,
  inferRouteOutput,
  inferSubscriptionOutput,
  Router,
  RouteWithInput,
} from '@trpc/server';
import { useMemo } from 'react';
import {
  QueryClient,
  useMutation,
  UseMutationOptions,
  UseMutationResult,
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from 'react-query';
import {
  dehydrate,
  DehydratedState,
  DehydrateOptions,
} from 'react-query/hydration';

export function createReactQueryHooks<
  TRouter extends Router<TContext, any, any, any>,
  TContext,
  TQueryClient extends QueryClient = any
>({ client, queryClient }: { client: TRPCClient; queryClient: TQueryClient }) {
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
          input,
        }),
      opts,
    );
    return hook;
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

  function useSubscription<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferRouteInput<TSubscriptions[TPath]>,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>[]
  >(
    pathAndArgs: [TPath, TInput],
    opts?: UseQueryOptions<TInput, TRPCClientError, TOutput>,
  ) {
    const [path, input] = pathAndArgs;

    const hook = useQuery<TInput, TRPCClientError, TOutput>(
      pathAndArgs,
      () => client.subscriptionOnce(path, input) as any,
      opts,
    );

    return hook;
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

  function _dehydrate(opts?: DehydrateOptions) {
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

  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscription,
    queryClient,
    prefetchQueryOnServer,
    /**
     * @deprecated renamed to `prefetchQueryOnServer`
     */
    prefetchQuery: prefetchQueryOnServer,
    dehydrate: _dehydrate,
    useDehydratedState,
  };
}
