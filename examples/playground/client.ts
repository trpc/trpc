import fetch from 'node-fetch';
import type { RootRouter } from './server';

function createHttpClient(opts: {
  baseUrl: `http://localhost:2021/trpc`;
  headers?: Record<string, string>;
}) {
  type Handler = ReturnType<RootRouter['handler']>;
  const headers = {
    'content-type': 'application/json',
    ...(opts.headers ?? {}),
  };
  const get: Handler = async (path, ...args) => {
    const res = await fetch(
      `${opts.baseUrl}/${path}?args=${encodeURIComponent(
        JSON.stringify(args as any),
      )}`,
      {
        headers,
      },
    );

    const json = await res.json();

    console.log('➡️ ', path, 'res:', json);

    return json;
  };
  const post: Handler = async (path, ...args) => {
    const res = await fetch(`${opts.baseUrl}/${path}`, {
      method: 'post',
      body: JSON.stringify({
        args,
      }),
      headers,
    });

    const json = await res.json();

    console.log('➡️ ', path, 'res:', json);
    return json;
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
