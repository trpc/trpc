/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRPCClient, TRPCClientError } from '@trpc/client';
import type {
  DropFirst,
  inferEndpointArgs,
  inferEndpointData,
  inferEndpointsWithoutArgs,
  Router,
  RouterResolverFn,
} from '@trpc/server';
import {
  QueryClient,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from 'react-query';

export function createReactQueryHooks<
  TRouter extends Router<TContext, any, any, any>,
  TContext
>({ client }: { client: TRPCClient<TRouter> }) {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];

  const queryClient = new QueryClient();

  function _useQuery<TPath extends keyof TQueries & string>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >,
  ) {
    return useQuery<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >(pathAndArgs, () => client.query(...pathAndArgs) as any, opts);
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
    return useMutation<
      inferEndpointData<TMutations[TPath]>,
      TRPCClientError,
      inferEndpointArgs<TMutations[TPath]>
    >((args) => client.mutate(path, ...args) as any, opts);
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
  ) => {
    return queryClient.prefetchQuery([path, ...args], () =>
      router['_def']['queries'][path](ctx, ...args),
    );
  };
  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
    useQueryNoArgs,
    queryClient,
    ssr,
  };
}
