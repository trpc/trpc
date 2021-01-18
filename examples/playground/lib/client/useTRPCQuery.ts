import {
  useMutation,
  UseMutationOptions,
  useQuery,
  UseQueryOptions,
} from 'react-query';
import type { RootRouter } from '../../server';
import type { HTTPResponseEnvelope } from '../http';
import type { inferEndpointArgs, inferEndpointData, Router } from '../router';
import type { HTTPClientError } from './createHttpClient';

function createHooks<TRouter extends Router<any, any, any>>({
  baseUrl,
}: {
  baseUrl: string;
}) {
  type TQueries = TRouter['_queries'];
  type TMutations = TRouter['_mutations'];

  async function handleResponse(res: Response) {
    const json: HTTPResponseEnvelope<unknown> = await res.json();

    if (json.ok === true) {
      return json.data as any;
    }
    throw new Error(json.error.message);
  }

  function _useQuery<TPath extends keyof TQueries>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TQueries[TPath]>],
    opts?: UseQueryOptions<
      inferEndpointData<TQueries[TPath]>,
      HTTPClientError,
      inferEndpointArgs<TQueries[TPath]>
    >,
  ) {
    return useQuery<
      inferEndpointData<TQueries[TPath]>,
      HTTPClientError,
      inferEndpointArgs<TQueries[TPath]>
    >(
      pathAndArgs,
      async () => {
        const headers = {
          'content-type': 'application/json',
        };
        const [path, ...args] = pathAndArgs;
        const res = await fetch(
          `${baseUrl}/${path}?args=${encodeURIComponent(
            JSON.stringify(args as any),
          )}`,
          {
            headers,
          },
        );

        return handleResponse(res);
      },
      opts,
    );
  }

  function _useMutation<TPath extends keyof TMutations>(
    path: TPath,
    opts?: UseMutationOptions<
      inferEndpointData<TMutations[TPath]>,
      unknown,
      inferEndpointArgs<TMutations[TPath]>
    >,
  ) {
    return useMutation<
      inferEndpointData<TMutations[TPath]>,
      unknown,
      inferEndpointArgs<TMutations[TPath]>
    >(async (args) => {
      const headers = {
        'content-type': 'application/json',
      };
      const res = await fetch(`${baseUrl}/${path}`, {
        method: 'post',
        body: JSON.stringify({
          args,
        }),
        headers,
      });

      return handleResponse(res);
    }, opts);
  }
  return {
    useQuery: _useQuery,
    useMutation: _useMutation,
  };
}

const hooks = createHooks<RootRouter>({
  baseUrl: 'test',
});

{
  const { data } = hooks.useQuery(['admin/secret']);

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
