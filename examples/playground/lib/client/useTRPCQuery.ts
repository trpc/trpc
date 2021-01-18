import {
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from 'react-query';
import type { RootRouter } from '../../server';
import type { HTTPResponseEnvelope } from '../http';
import type { inferEndpointArgs, inferEndpointData, Router } from '../router';
import { createHttpClient, HTTPClientError, HTTPSdk } from './createHttpClient';

function createHooks<TRouter extends Router<any, any, any>>({
  client,
}: {
  client: HTTPSdk<TRouter>;
}) {
  type TQueries = TRouter['_queries'];
  type TMutations = TRouter['_mutations'];

  function _useQuery<TPath extends keyof TQueries>(
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

  function _useMutation<TPath extends keyof TMutations>(
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
  };
}

const client = createHttpClient({
  url: '...',
});
const hooks = createHooks<RootRouter>({
  client,
});

{
  const { data } = hooks.useQuery(['admin/secret']);

  console.log(data);
}
{
  const { data } = hooks.useQuery(['posts/list']);

  console.log(data);
}
{
  const { data } = hooks.useQuery(['hello', 'world']);

  console.log(data);
}
{
  const m = hooks.useMutation('posts/create');
  m.mutate([{ title: 'hej' }]);
  console.log('data', m.data);
}
