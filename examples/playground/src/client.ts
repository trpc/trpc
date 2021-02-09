import { createTRPCClient, CreateTRPCClientOptions } from '@trpc/client';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

// polyfill
global.AbortController = AbortController;
global.fetch = fetch as any;

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = `http://localhost:2021/trpc`;
  const opts: CreateTRPCClientOptions = {
    url,
    onSuccess(envelope) {
      console.log('✅ ', envelope.statusCode);
    },

    onError(err) {
      console.log('❌ ', err.res?.status, err.message);
    },
  };

  const client = createTRPCClient<AppRouter>(opts);
  await sleep();
  await client.query('hello');
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
  const authedClient = createTRPCClient<AppRouter>({
    ...opts,
    getHeaders: () => ({
      authorization: 'secret',
    }),
  });

  await authedClient.query('admin/secret');

  const msgs = await client.query('messages/list');
  console.log('msgs', msgs);

  let i = 0;

  const unsubscribe = client.subscription('posts/newMessage', {
    initialInput: {
      timestamp: msgs.reduce((max, msg) => Math.max(max, msg.createdAt), 0),
    },
    onData(buffer) {
      console.log('<- subscription received', buffer.flat().length, 'messages');
      buffer.flat().forEach((msg) => {
        msgs.push(msg);
      });
    },
    nextInput() {
      return {
        timestamp: msgs.reduce((max, msg) => Math.max(max, msg.createdAt), 0),
      };
    },
  });

  await Promise.all([
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
  ]);
  await sleep();

  await client.mutate('messages/add', `test message${i++}`);

  await Promise.all([
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
  ]);

  unsubscribe();
  console.log('👌 should be a clean exit if everything is working right');
}

main();
