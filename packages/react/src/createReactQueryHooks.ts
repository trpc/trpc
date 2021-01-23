/* eslint-disable @typescript-eslint/no-explicit-any */
import { transformData, TRPCClient, TRPCClientError } from '@katt/trpc-client';
import type {
  DropFirst,
  inferEndpointArgs,
  inferEndpointData,
  inferEndpointsWithoutArgs,
  Router,
  RouterResolverFn,
} from '@katt/trpc-server';
import { useCallback, useMemo } from 'react';
import {
  QueryClient,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from 'react-query';

export function createReactQueryHooks<
  TRouter extends Router<TContext, any, any, any>,
  TContext,
  TQueryClient extends QueryClient = any
>({
  client,
  queryClient,
}: {
  client: TRPCClient<TRouter>;
  queryClient: TQueryClient;
}) {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];

  function _useQuery<TPath extends keyof TQueries & string>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >,
  ) {
    const hook = useQuery<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >(pathAndArgs, () => client.query(...pathAndArgs) as any, opts);

    const data = useMemo(() => transformData(client.transformers, hook.data), [
      hook.data,
    ]) as inferEndpointData<TQueries[TPath]>;
    return {
      ...hook,
      data,
    };
  }

  /**
   * use a query that doesn't require args
   * @deprecated **🚧 WIP** should be combined with `useQuery`
   */
  function useQueryNoArgs<
    TPath extends inferEndpointsWithoutArgs<TQueries> & string & keyof TQueries
  >(
    path: TPath,
    opts?: UseQueryOptions<
      never,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >,
  ) {
    return useQuery<never, TRPCClientError, inferEndpointData<TQueries[TPath]>>(
      path,
      () => (client.query as any)(path) as any,
      opts,
    );
  }
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
    >((args) => client.mutate(path, ...args) as any, opts);

    const mutateAsync: typeof mutation['mutateAsync'] = useCallback(
      async (...args) => {
        const orig = await mutation.mutateAsync(...args);

        return transformData(client.transformers, orig) as any;
      },
      [],
    );
    return {
      ...mutation,
      mutateAsync,
    };
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
      const data = await router.invokeQuery(ctx)(path, ...args);
      // console.log('data', data);
      return data;
    });
  };
  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
    useQueryNoArgs,
    queryClient,
    ssr,
  };
}
