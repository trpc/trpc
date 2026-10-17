import { MessageChannel, threadId, Worker } from 'node:worker_threads';
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import type { WorkerRouter } from './fixtures/worker-server.ts';

async function startWorker() {
  const worker = new Worker(
    new URL('./fixtures/worker-server.ts', import.meta.url),
  );
  const link = experimental_messagePortLink({
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
    defined: true,
    data: { why: 'no' },
  });
  const invalid = await safe(ctx.client.fib.query({ n: 1000 }));
  expect(invalid.error).toMatchObject({ code: 'BAD_REQUEST' });

  const slowly = await ctx.client.slowly.query();
  expect(slowly.ready).toBe(true);
  expect(await slowly.later).toBe(new Date(1000).toJSON());

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
  const channel = new MessageChannel();
  createFetchHandler({ router }).messagePort(channel.port1);
  const link = experimental_messagePortLink({ port: channel.port2 });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  try {
    expect(await client.ping.query()).toBe('pong');
  } finally {
    await link.close();
    channel.port1.close();
    channel.port2.close();
  }
});

test('file bytes cross a port as bytes, not base64', async () => {
  const t = initTrpc();
  const router = {
    report: t.procedure.query(() => ({
      file: new File([new Uint8Array([0, 255, 1])], 'r.bin'),
    })),
  };
  const channel = new MessageChannel();
  const { port2 } = channel;
  const serializer = createSerializer();
  createFetchHandler({ router, serializer }).messagePort(channel.port1);
  const sent: unknown[] = [];
  port2.on('message', (message: unknown) => sent.push(message));
  const link = experimental_messagePortLink({ port: port2, serializer });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [link],
  });
  try {
    const query = await client.report.query();
    expect([...new Uint8Array(await query.file.arrayBuffer())]).toEqual([
      0, 255, 1,
    ]);
    const wire = JSON.stringify(sent);
    expect(wire).toContain('{"0":0,"1":255,"2":1}');
    expect(wire).not.toContain('AP8B');
  } finally {
    await link.close();
    channel.port1.close();
    port2.close();
  }
});

test('a port peer that posts values JSON cannot hold is refused', async () => {
  const t = initTrpc();
  const channel = new MessageChannel();
  const { port2 } = channel;
  createFetchHandler({
    router: {
      echo: t.procedure.input(z.unknown()).mutation((opts) => opts.input),
    },
    serializer: createSerializer(),
  }).messagePort(channel.port1);
  const replies: unknown[] = [];
  const replied = new Promise<void>((resolve) =>
    port2.on('message', (message: { type: string }) => {
      replies.push(message);
      if (message.type === 'error') resolve();
    }),
  );
  try {
    port2.postMessage({ type: 'init', version: '12', serializer: 'danson' });
    // Structured clone keeps the Date; danSON only reads JSON.
    port2.postMessage({
      id: 1,
      type: 'request',
      method: 'mutation',
      path: 'echo',
      input: { json: { when: new Date(0) } },
    });
    await replied;
    expect(replies.at(-1)).toMatchObject({
      id: 1,
      type: 'error',
      body: {
        json: {
          error: {
            code: 'PARSE_ERROR',
            message: 'Deserializing unknown value',
          },
        },
      },
    });
  } finally {
    channel.port1.close();
    port2.close();
  }
});
