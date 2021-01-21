import {
  FetchQueryOptions,
  QueryClient,
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from 'react-query';
import { TRPCClient, TRPCClientError } from 'trpc-client';
import type {
  inferEndpointArgs,
  inferEndpointData,
  inferEndpointsWithoutArgs,
  inferHandler,
  AnyRouter,
} from 'trpc-server';

export function createReactQueryHooks<TRouter extends AnyRouter>({
  client,
}: {
  client: TRPCClient<TRouter>;
}) {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TQueryClient = Omit<QueryClient, 'prefetchQuery'> & {
    prefetchQuery: <TPath extends keyof TQueries & string>(
      args: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
      handler: inferHandler<TQueries>,
      options?: FetchQueryOptions
    ) => Promise<inferEndpointData<TQueries[TPath]>>;
  };

  const queryClient = new QueryClient();

  function _useQuery<TPath extends keyof TQueries & string>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointArgs<TQueries[TPath]>,
      TRPCClientError,
      inferEndpointData<TQueries[TPath]>
    >
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
    >
  ) {
    return useQuery<never, TRPCClientError, inferEndpointData<TQueries[TPath]>>(
      path,
      () => (client.query as any)(path) as any,
      opts
    );
  }
  function _useMutation<TPath extends keyof TMutations & string>(
    path: TPath,
    opts?: UseMutationOptions<
      inferEndpointData<TMutations[TPath]>,
      TRPCClientError,
      inferEndpointArgs<TMutations[TPath]>
    >
  ) {
    return useMutation<
      inferEndpointData<TMutations[TPath]>,
      TRPCClientError,
      inferEndpointArgs<TMutations[TPath]>
    >((args) => client.mutate(path, ...args) as any, opts);
  }
  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
    useQueryNoArgs,
    queryClient: (queryClient as any) as TQueryClient,
  };
}
