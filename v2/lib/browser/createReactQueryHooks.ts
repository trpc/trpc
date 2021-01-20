import {
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
  UseQueryResult,
  QueryClient,
  FetchQueryOptions,
} from 'react-query';
import type {
  inferEndpointArgs,
  inferEndpointData,
  inferEndpointsWithoutArgs,
  inferHandler,
  Router,
} from '../server/router';
import { HTTPClientError, HTTPSdk } from './createHttpClient';

export function createReactQueryHooks<TRouter extends Router<any, any, any>>({
  client,
}: {
  client: HTTPSdk<TRouter>;
}) {
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TQueryClient = Omit<QueryClient, 'prefetchQuery'> & {
    prefetchQuery: <TPath extends keyof TQueries & string>(
      args: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
      handler: inferHandler<TQueries>,
      options?: FetchQueryOptions,
    ) => Promise<inferEndpointData<TQueries[TPath]>>;
  };

  const queryClient = new QueryClient();

  function _useQuery<TPath extends keyof TQueries & string>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointArgs<TQueries[TPath]>,
      HTTPClientError,
      inferEndpointData<TQueries[TPath]>
    >,
  ) {
    return useQuery<
      inferEndpointArgs<TQueries[TPath]>,
      HTTPClientError,
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
      HTTPClientError,
      inferEndpointData<TQueries[TPath]>
    >,
  ) {
    return useQuery<never, HTTPClientError, inferEndpointData<TQueries[TPath]>>(
      path,
      () => (client.query as any)(path) as any,
      opts,
    );
  }
  function _useMutation<TPath extends keyof TMutations & string>(
    path: TPath,
    opts?: UseMutationOptions<
      inferEndpointData<TMutations[TPath]>,
      HTTPClientError,
      inferEndpointArgs<TMutations[TPath]>
    >,
  ) {
    return useMutation<
      inferEndpointData<TMutations[TPath]>,
      HTTPClientError,
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
