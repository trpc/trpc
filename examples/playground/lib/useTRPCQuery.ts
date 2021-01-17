import {
  useQuery,
  useMutation,
  UseQueryOptions,
  UseMutationOptions,
} from 'react-query';
import { RootRouter } from '../server';
import { HTTPClientError } from './createHttpClient';
import { HTTPResponseEnvelope } from './http';
import type {
  inferEndpointArgs,
  inferEndpointData,
  Router,
  RouterResolverFn,
} from './router';
import { DropFirst } from './types';

function createHooks<TRouter extends Router<any, any>>({
  baseUrl,
}: {
  baseUrl: string;
}) {
  type TEndpoints = TRouter['_endpoints'];

  async function handleResponse(res: Response) {
    const json: HTTPResponseEnvelope<unknown> = await res.json();

    if (json.ok === true) {
      return json.data as any;
    }
    throw new Error(json.error.message);
  }

  function _useQuery<TPath extends keyof TEndpoints>(
    pathAndArgs: [TPath, ...inferEndpointArgs<TRouter, TPath>],
    opts?: UseQueryOptions<
      inferEndpointData<TRouter, TPath>,
      HTTPClientError,
      inferEndpointArgs<TRouter, TPath>
    >,
  ) {
    return useQuery<
      inferEndpointData<TRouter, TPath>,
      HTTPClientError,
      inferEndpointArgs<TRouter, TPath>
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

  function _useMutation<
    TPath extends keyof TEndpoints,
    TArgs extends DropFirst<Parameters<TResolver>>,
    TResolver extends RouterResolverFn<any, any, any>
  >(
    path: TPath,
    opts?: UseMutationOptions<
      inferEndpointData<TRouter, TPath>,
      unknown,
      TArgs
    >,
  ) {
    return useMutation<inferEndpointData<TRouter, TPath>, unknown, TArgs>(
      async (args) => {
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
      },
      opts,
    );
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
}
