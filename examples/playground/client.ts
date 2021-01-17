import fetch from 'node-fetch';
import {
  createHttpClient,
  CreateHttpClientOptions,
} from './lib/client/createHttpClient';
import type { RootRouter } from './server';

const sleep = () => new Promise((resolve) => setTimeout(resolve, 100));

async function main() {
  {
    const url = `http://localhost:2021/trpc`;
    const opts: CreateHttpClientOptions = {
      url,
      fetch: fetch as any,
      onSuccess(envelope) {
        console.log('✅ ', envelope);
      },

      onError(err) {
        console.log('❌ ', err);
      },
    };
    const client = createHttpClient<RootRouter>(opts);

    await client.get('hello', 'client');
    await sleep();
    await client.post('posts/create', {
      title: 'hello client',
    });
    await sleep();
    await client.get('posts/list');
    await sleep();
    try {
      await client.get('admin/secret');
    } catch (err) {
      // will fail
    }
    await sleep();
    const authedClient = createHttpClient<RootRouter>({
      ...opts,
      getHeaders: () => ({
        authorization: 'secret',
      }),
    });

    await authedClient.get('admin/secret');
  }
}

main();
