import fetch from 'node-fetch';
import AbortController from 'abort-controller';
import type { RootRouter } from './server';
import { createTRPCClient, CreateTRPCClientOptions } from '@trpc/client';

const sleep = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const url = `http://localhost:2021/trpc`;
  const opts: CreateTRPCClientOptions = {
    url,
    fetchOpts: {
      AbortController: AbortController as any,
      fetch: fetch as any,
    },
    onSuccess(envelope) {
      console.log('✅ ', envelope.statusCode);
    },

    onError(err) {
      console.log('❌ ', err.res?.status, err.message);
    },
  };

  const client = createTRPCClient<RootRouter>(opts);
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
  const authedClient = createTRPCClient<RootRouter>({
    ...opts,
    getHeaders: () => ({
      authorization: 'secret',
    }),
  });

  await authedClient.query('admin/secret');

  const msgs = await client.query('messages/list');
  console.log('msgs', msgs);

  let i = 0;
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
    client.mutate('messages/add', `test message${i++}`),
    client.mutate('messages/add', `test message${i++}`),
  ]);

  console.log('👌 should be a clean exit if everything is working right');
}

main();
