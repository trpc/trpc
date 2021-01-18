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

    await client.query('hello', 'client');
    await sleep();
    const postCreate = await client.mutate('posts/create', {
      title: 'hello client',
    });
    console.log('created post', postCreate.title);
    await sleep();
    const postList = await client.query('posts/list');
    console.log('has posts', postList, 'first:', postList[0].title);
    await sleep();
    try {
      await client.query('admin/secret');
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

    await authedClient.query('admin/secret');
  }
}

main();
