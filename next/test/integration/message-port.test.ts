import { MessageChannel, threadId, Worker } from 'node:worker_threads';
import {
  createTrpcClient,
  messagePortLink,
  routerType,
  safe,
} from 'trpcdev/client';
import { createFetchHandler, initTrpc } from 'trpcdev/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import type { WorkerRouter } from './fixtures/worker-server.ts';

async function startWorker() {
  const worker = new Worker(
    new URL('./fixtures/worker-server.ts', import.meta.url),
  );
  const link = messagePortLink({
    port: worker,
    connectionParams: { token: 'secret' },
  });
  const client = createTrpcClient({
    router: routerType<WorkerRouter>(),
    links: [link],
  });
  return {
    worker,
    client,
    [Symbol.asyncDispose]: async () => {
      await link.close();
      await worker.terminate();
    },
  };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('a worker thread serves calls over its parentPort', async () => {
  await using ctx = await startWorker();
  const thread = await ctx.client.thread.query();
  expect(thread.threadId).not.toBe(threadId);
  expect(thread).toMatchObject({ token: 'secret', transport: 'messagePort' });
  expectTypeOf(thread.token).toEqualTypeOf<string | undefined>();

  const results = await Promise.all(
    [10, 20, 25].map((n) => ctx.client.fib.query({ n })),
  );
  expect(results).toEqual([55, 6765, 75025]);
});

test('errors, deferred values and subscriptions cross the port', async () => {
  await using ctx = await startWorker();
  const res = await safe(ctx.client.fail.query());
  expect(res.error).toMatchObject({
    code: 'FORBIDDEN',
    status: 403,
    defined: true,
    data: { why: 'no' },
  });
  const invalid = await safe(ctx.client.fib.query({ n: 1000 }));
  expect(invalid.error).toMatchObject({ code: 'BAD_REQUEST' });

  const slowly = await ctx.client.slowly.query();
  expect(slowly.ready).toBe(true);
  expect(await slowly.later).toEqual(new Date(1000));

  const events = await collect(ctx.client.progress.subscribe());
  expect(events).toEqual([
    { id: '1', data: { percent: 33 } },
    { id: '2', data: { percent: 66 } },
    { id: '3', data: { percent: 99 } },
  ]);
});

test('a MessageChannel connects a client and a handler in one thread', async () => {
  const t = initTrpc();
  const router = { ping: t.procedure.query(() => 'pong' as const) };
  const { port1, port2 } = new MessageChannel();
  createFetchHandler({ router }).messagePort(port1);
  const link = messagePortLink({ port: port2 });
  const client = createTrpcClient<typeof router>({ links: [link] });
  try {
    expect(await client.ping.query()).toBe('pong');
  } finally {
    await link.close();
    port1.close();
    port2.close();
  }
});
