/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCClient, TRPCClientError } from '@trpcdev/client';
import type {
  DataTransformer,
  DropFirst,
  inferEndpointArgs,
  inferEndpointData,
  inferSubscriptionData,
  Router,
  RouterResolverFn,
} from '@trpcdev/server';
import { useCallback, useMemo } from 'react';
import {
  QueryClient,
  QueryObserverResult,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from 'react-query';

// type UnsubscribeFn = () => void;

// type inferSubscriptionFn<TRouter extends AnyRouter> = <
//   TPath extends keyof TRouter['_def']['subscriptions'],
//   TArgs extends inferEndpointArgs<TRouter['_def']['subscriptions'][TPath]> &
//     any[],
//   TData extends inferSubscriptionData<
//     inferAsyncReturnType<TRouter['_def']['subscriptions'][TPath]>
//   >
// >(
//   pathAndArgs: [TPath, ...TArgs],
//   opts: {
//     onSuccess?: (data: TData) => void;
//     onError?: (error: TRPCClientError) => void;
//     getNextArgs?: (data: TData) => TArgs;
//   },
// ) => UnsubscribeFn;

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

  const serializeArgs = (args: unknown[]): unknown[] =>
    args.map((arg) => transformer.serialize(arg));

  function _useQuery<TPath extends keyof TQueries & string>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >,
  ) {
    type TData = inferEndpointData<TQueries[TPath]>;
    const [path, ...args] = pathAndArgs;

    const hook = useQuery<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      TData
    >(
      pathAndArgs,
      () =>
        client.request({
          type: 'query',
          path,
          args: serializeArgs(args),
        }) as any,
      opts,
    );
    const data = useMemo(
      () =>
        typeof hook.data !== 'undefined'
          ? (transformer.deserialize(hook.data) as TData)
          : hook.data,
      [hook.data],
    );
    return {
      ...hook,
      data,
    } as QueryObserverResult<TData, TRPCClientError>;
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
  //     inferEndpointData<TQueries[TPath]>
  //   >,
  // ) {
  //   const hook = useQuery<
  //     never,
  //     TRPCClientError,
  //     inferEndpointData<TQueries[TPath]>
  //   >(path, () => (client.query as any)(path) as any, opts);
  //   const data = useMemo(() => client.transformer.deserialize(hook.data), [
  //     hook.data,
  //   ]) as inferEndpointData<TQueries[TPath]>;

  //   return {
  //     ...hook,
  //     data,
  //   };
  // }
  function _useMutation<TPath extends keyof TMutations & string>(
    path: TPath,
    opts?: UseMutationOptions<
      inferEndpointData<TMutations[TPath]>,
      TRPCClientError,
      inferEndpointArgs<TMutations[TPath]>
    >,
  ) {
    const mutation = useMutation<
      inferEndpointData<TMutations[TPath]>,
      TRPCClientError,
      inferEndpointArgs<TMutations[TPath]>
    >(
      (args) =>
        client.request({
          type: 'mutation',
          path,
          args: serializeArgs(args),
        }) as any,
      opts,
    );

    const mutateAsync: typeof mutation['mutateAsync'] = useCallback(
      async (...args) => {
        const orig = await mutation.mutateAsync(...args);

        return transformer.deserialize(orig) as any;
      },
      [mutation.mutateAsync],
    );
    return {
      ...mutation,
      mutateAsync,
    };
  }

  function useSubscription<TPath extends keyof TSubscriptions & string>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TSubscriptions[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointArgs<TSubscriptions[TPath]>,
      TRPCClientError,
      inferSubscriptionData<TSubscriptions[TPath]>
    >,
  ) {
    type TData = inferSubscriptionData<TSubscriptions[TPath]>;

    const [path, ...args] = pathAndArgs;

    const hook = useQuery<
      inferEndpointArgs<TSubscriptions[TPath]>,
      TRPCClientError,
      inferSubscriptionData<TSubscriptions[TPath]>
    >(
      pathAndArgs,
      () => client.subscriptionOnce(path, ...serializeArgs(args)) as any,
      opts,
    );

    const data = useMemo(
      () =>
        typeof hook.data !== 'undefined'
          ? (transformer.deserialize(hook.data) as TData)
          : hook.data,
      [hook.data],
    );
    return {
      ...hook,
      data,
    } as QueryObserverResult<TData, TRPCClientError>;
  }

  const ssr = async <
    TEndpoints extends TRouter['_def']['queries'],
    TResolver extends TEndpoints & RouterResolverFn,
    TArgs extends DropFirst<Parameters<TResolver>>,
    TPath extends keyof TEndpoints & string
  >(
    router: TRouter,
    path: TPath,
    ctx: TContext,
    ...args: TArgs
  ): Promise<void> => {
    // console.log('invoking', { ctx, path, router });
    return queryClient.prefetchQuery([path, ...args], async () => {
      const data = await router.invokeQuery(ctx)(
        path,
        ...(serializeArgs(args) as any),
      );
      // console.log('data', data);
      return transformer.serialize(data);
    });
  };

  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
    useSubscription,
    queryClient,
    ssr,
  };
}
