import fetch, { Response } from 'node-fetch';
import {
  HTTPResponseEnvelope,
  // inferEndpointArgs,
  // inferEndpointData,
} from './lib';
import type { RootRouter } from './server';

// type D = inferEndpointData<RootRouter, 'admin/secret'>;
// type Args = inferEndpointArgs<RootRouter, 'posts/create'>;
const sleep = () => new Promise((resolve) => setTimeout(resolve, 100));
function createHttpClient(opts: {
  baseUrl: `http://localhost:2021/trpc`;
  headers?: Record<string, string>;
}) {
  type Handler = ReturnType<RootRouter['handler']>;
  const headers = {
    'content-type': 'application/json',
    ...(opts.headers ?? {}),
  };
  async function handleResponse(res: Response) {
    const json: HTTPResponseEnvelope<unknown> = await res.json();

    await sleep(); // simulate some loading
    console.log('➡️ ', res.status, 'res:', json);

    if (json.ok === true) {
      return json.data as any;
    }
    throw new Error(json.error.message);
  }
  const get: Handler = async (path, ...args) => {
    const res = await fetch(
      `${opts.baseUrl}/${path}?args=${encodeURIComponent(
        JSON.stringify(args as any),
      )}`,
      {
        headers,
      },
    );

    return handleResponse(res);
  };
  const post: Handler = async (path, ...args) => {
    const res = await fetch(`${opts.baseUrl}/${path}`, {
      method: 'post',
      body: JSON.stringify({
        args,
      }),
      headers,
    });

    return handleResponse(res);
  };
  return {
    get,
    post,
  };
}
async function main() {
  {
    const baseUrl = `http://localhost:2021/trpc`;
    const client = createHttpClient({ baseUrl });

    await client.get('hello', 'client');
    await client.post('posts/create', {
      title: 'hello client',
    });
    await client.get('posts/list');
    await client.get('admin/secret');

    const authedClient = createHttpClient({
      baseUrl,
      headers: {
        authorization: 'secret',
      },
    });

    await authedClient.get('admin/secret');
  }
}

main();
