import fetch from 'node-fetch';
import type { RootRouter } from './server';

function createHttpClient(opts: { baseUrl: `http://localhost:2021/trpc` }) {
  type Handler = ReturnType<RootRouter['handler']>;

  const get: Handler = async (path, ...args) => {
    const res = await fetch(
      `${opts.baseUrl}/${path}?args=${encodeURIComponent(
        JSON.stringify(args as any),
      )}`,
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
      headers: {
        'content-type': 'application/json',
      },
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
  }
}

main();
