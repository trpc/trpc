/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  DataTransformer,
  inferRouteInput,
  inferRouteOutput,
  inferSubscriptionOutput,
  Router,
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

  const serializeInput = (input: unknown): unknown[] =>
    typeof input !== 'undefined' ? transformer.serialize(input) : input;

  const useDeserializedData = <TOutput = unknown>(data: unknown) =>
    useMemo(
      () =>
        typeof data !== 'undefined'
          ? (transformer.deserialize(data) as TOutput)
          : data,
      [data],
    );

  function _useQuery<
    TPath extends keyof TQueries & string,
    TInput extends inferRouteInput<TQueries[TPath]>,
    TOutput extends inferRouteOutput<TQueries[TPath]>
  >(
    pathAndArgs: [TPath, TInput],
    opts?: UseQueryOptions<TInput, TRPCClientError, TOutput>,
  ): UseQueryResult<TOutput, TRPCClientError> {
    const [path, input] = pathAndArgs;

    const hook = useQuery<TInput, TRPCClientError, TOutput>(
      pathAndArgs,
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

  // /**
  //  * use a query that doesn't require args
  //  * @deprecated **🚧 WIP** should be combined with `useQuery`
  //  */
  // function useQueryNoArgs<
  //   TPath extends inferEndpointsWithoutArgs<TQueries> & string & keyof TQueries
  // >(
  //   path: TPath,
  //   opts?: UseQueryOptions<
  //     never,
  //     TRPCClientError,
  //     inferRouteOutput<TQueries[TPath]>
  //   >,
  // ) {
  //   const hook = useQuery<
  //     never,
  //     TRPCClientError,
  //     inferRouteOutput<TQueries[TPath]>
  //   >(path, () => (client.query as any)(path) as any, opts);
  //   const data = useMemo(() => client.transformer.deserialize(hook.data), [
  //     hook.data,
  //   ]) as inferRouteOutput<TQueries[TPath]>;

  //   return {
  //     ...hook,
  //     data,
  //   };
  // }
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

    const mutateAsync: typeof hook['mutateAsync'] = useCallback(
      async (...args) => {
        const orig = await hook.mutateAsync(...args);

        return transformer.deserialize(orig) as any;
      },
      [hook.mutateAsync],
    );
    const data = useDeserializedData<TOutput>(hook.data);
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
    {
      path,
      ctx,
      input,
    }: {
      path: TPath;
      ctx: TContext;
      input: TInput;
    },
  ): Promise<void> => {
    // console.log('invoking', { ctx, path, router });
    if (typeof input === 'undefined') {
      console.warn('You cant use `undefined` input in ssr as it can\'t be serialized - treating it as null')
      if (__DEV__) {
        throw new Error('See above message');
      }
    }
    return queryClient.prefetchQuery([path, input], async () => {
      const data = await router.invokeUntyped({
        target: 'queries',
        ctx,
        path,
        input,
      });
      console.log({data, path, input})
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
