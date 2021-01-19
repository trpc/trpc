import fetch from 'node-fetch';
import {
  createHttpClient,
  CreateHttpClientOptions,
} from './lib/browser/createHttpClient';
import type { RootRouter } from './server';

const sleep = () => new Promise((resolve) => setTimeout(resolve, 100));

async function main() {
  const url = `http://localhost:2021/trpc`;
  const opts: CreateHttpClientOptions = {
    url,
    fetch: fetch as any,
    onSuccess(envelope) {
      console.log('✅ ', envelope.statusCode);
    },

    onError(err) {
      console.log('❌ ', err.res?.status, err);
    },
  };
  const client = createHttpClient<RootRouter>(opts);
  await sleep();
  // await client.query('hello', 'client');
  // await sleep();
  // const postCreate = await client.mutate('posts/create', {
  //   title: 'hello client',
  // });
  // console.log('created post', postCreate.title);
  // await sleep();
  // const postList = await client.query('posts/list');
  // console.log('has posts', postList, 'first:', postList[0].title);
  // await sleep();
  // try {
  //   await client.query('admin/secret');
  // } catch (err) {
  //   // will fail
  // }
  // await sleep();
  // const authedClient = createHttpClient<RootRouter>({
  //   ...opts,
  //   getHeaders: () => ({
  //     authorization: 'secret',
  //   }),
  // });

  // await authedClient.query('admin/secret');
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
  client.subscription(
    ['messages/newMessages', { timestamp: getTimestamp(msgs) }],
    {
      onSuccess(data) {
        console.log(`✉️  ${data.length} new messages`);
        msgs.push(...data);
      },
      onError(data) {
        console.error('❌ message fail', data);
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
}

main();
