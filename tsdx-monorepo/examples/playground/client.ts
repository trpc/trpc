import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import {
  createHttpClient,
  CreateHttpClientOptions,
} from '../../packages/trpc/src/browser/createHttpClient';
import type { RootRouter } from './server';

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = `http://localhost:2021/trpc`;
  const opts: CreateHttpClientOptions = {
    url,
    fetch: fetch as any,
    AbortController,
    onSuccess(envelope) {
      console.log('✅ ', envelope.statusCode);
    },

    onError(err) {
      console.log('❌ ', err.res?.status, err.message);
    },
  };
  const client = createHttpClient<RootRouter>(opts);
  await sleep();
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

  let msgs = await client.query('messages/list');
  const getTimestamp = (m: typeof msgs) => {
    return m.reduce((ts, msg) => {
      return Math.max(ts, msg.updatedAt, msg.createdAt);
    }, 0);
  };

  let i = 0;
  await Promise.all([
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
  ]);
  await sleep();
  const unsub = client.subscription(
    ['messages/newMessages', { timestamp: getTimestamp(msgs) }],
    {
      onSuccess(data) {
        console.log(`✉️  ${data.length} new messages`);
        msgs.push(...data);
      },
      onError(err) {
        console.error('❌ message fail', err.res?.status);
      },
      getNextArgs(data) {
        return [
          {
            timestamp: getTimestamp(data),
          },
        ];
      },
    },
  );
  await sleep();

  await client.mutate('messages/add', `test message${i++}`);

  await Promise.all([
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
  ]);

  await sleep(10e3);
  console.log('should be a clean exit if everything is working right');
  unsub();
}

main();
