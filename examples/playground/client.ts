import fetch from 'node-fetch';
import type { RootRouter } from './server';
import querystring from 'querystring';

function createHttpClient(opts: { baseUrl: `http://localhost:2021/trpc` }) {
  type Handler = ReturnType<RootRouter['handler']>;

  const get: Handler = async (path, ...args) => {
    const res = await fetch(
      `${opts.baseUrl}/${path}?${querystring.encode({
        args: args as any,
      })}`,
    );

    const json = await res.json();

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

    {
      const res = await client.get('hello', 'client');
      console.log('client result:', res);
    }
    {
      const res = await client.post('posts/create', {
        title: 'hello client',
      });
      console.log('client res', res);
    }
    {
      const res = await client.get('posts/list');
      console.log('client res', res);
    }
    {
      console.log('⚠️ enforcing an error');

      const res = await client.post('posts/create', 0 as any);
      console.log('client res', res);
    }
  }
}

main();
