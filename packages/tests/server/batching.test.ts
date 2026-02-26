import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  hello: t.procedure
    .input(z.string().optional())
    .query((opts) => `Hello ${opts.input ?? 'world'}` as const),
});

describe('batchIndex', () => {
  test('batchIndex is passed correctly in batched requests', async () => {
    const callIndices: (number | undefined)[] = [];

    const tWithCallIndex = initTRPC.create();
    const routerWithCallIndex = tWithCallIndex.router({
      getCallIndex: tWithCallIndex.procedure.input(z.string()).query((opts) => {
        callIndices.push(opts.batchIndex);
        return { input: opts.input, batchIndex: opts.batchIndex };
      }),
    });

    await using ctx = testServerAndClientResource(routerWithCallIndex, {
      server: {},
      clientLink: 'httpBatchLink',
    });

    const results = await Promise.all([
      ctx.client.getCallIndex.query('first'),
      ctx.client.getCallIndex.query('second'),
      ctx.client.getCallIndex.query('third'),
    ]);

    expect(results).toEqual([
      { input: 'first', batchIndex: 0 },
      { input: 'second', batchIndex: 1 },
      { input: 'third', batchIndex: 2 },
    ]);

    expect(callIndices).toEqual([0, 1, 2]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('batchIndex is passed correctly in streamed batched requests', async () => {
    const callIndices: (number | undefined)[] = [];

    const tWithCallIndex = initTRPC.create();
    const routerWithCallIndex = tWithCallIndex.router({
      getCallIndex: tWithCallIndex.procedure.input(z.string()).query((opts) => {
        callIndices.push(opts.batchIndex);
        return { input: opts.input, batchIndex: opts.batchIndex };
      }),
    });

    await using ctx = testServerAndClientResource(routerWithCallIndex, {
      server: {},
      clientLink: 'httpBatchStreamLink',
    });

    const results = await Promise.all([
      ctx.client.getCallIndex.query('first'),
      ctx.client.getCallIndex.query('second'),
      ctx.client.getCallIndex.query('third'),
    ]);

    expect(results).toEqual([
      { input: 'first', batchIndex: 0 },
      { input: 'second', batchIndex: 1 },
      { input: 'third', batchIndex: 2 },
    ]);

    expect(callIndices).toEqual([0, 1, 2]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  });

  test('batchIndex is provided for non-batched requests', async () => {
    const callIndices: (number | undefined)[] = [];

    const tWithCallIndex = initTRPC.create();
    const routerWithCallIndex = tWithCallIndex.router({
      getCallIndex: tWithCallIndex.procedure.input(z.string()).query((opts) => {
        callIndices.push(opts.batchIndex);
        return { input: opts.input, batchIndex: opts.batchIndex };
      }),
    });

    await using ctx = testServerAndClientResource(routerWithCallIndex, {
      server: {},
      clientLink: 'httpLink',
    });

    const result = await ctx.client.getCallIndex.query('single');

    expect(result).toEqual({ input: 'single', batchIndex: 0 });
  });

  test('batchIndex is provided for single-call batch requests', async () => {
    const callIndices: (number | undefined)[] = [];

    const tWithCallIndex = initTRPC.create();
    const routerWithCallIndex = tWithCallIndex.router({
      getCallIndex: tWithCallIndex.procedure.input(z.string()).query((opts) => {
        callIndices.push(opts.batchIndex);
        return { input: opts.input, batchIndex: opts.batchIndex };
      }),
    });

    await using ctx = testServerAndClientResource(routerWithCallIndex, {
      server: {},
      clientLink: 'httpBatchLink',
    });

    const result = await Promise.all([ctx.client.getCallIndex.query('single')]);

    expect(result).toEqual([{ input: 'single', batchIndex: 0 }]);
    expect(callIndices).toEqual([0]);
  });

  test('batchIndex is available in middleware', async () => {
    const middlewareCallIndices: (number | undefined)[] = [];

    const tWithMiddleware = initTRPC.create();

    const procedureWithMiddleware = tWithMiddleware.procedure.use((opts) => {
      middlewareCallIndices.push(opts.batchIndex);
      return opts.next();
    });

    const routerWithMiddleware = tWithMiddleware.router({
      testProc: procedureWithMiddleware
        .input(z.string())
        .query((opts) => opts.input),
    });

    await using ctx = testServerAndClientResource(routerWithMiddleware, {
      server: {},
      clientLink: 'httpBatchLink',
    });

    await Promise.all([
      ctx.client.testProc.query('a'),
      ctx.client.testProc.query('b'),
    ]);

    expect(middlewareCallIndices).toEqual([0, 1]);
  });
});

test('batching enabled', async () => {
  await using ctx = testServerAndClientResource(router, {
    server: {},
    clientLink: 'httpBatchLink',
  });

  const results = await Promise.all([
    ctx.client.hello.query('1'),
    ctx.client.hello.query('2'),
  ]);

  expect(results).toMatchInlineSnapshot(`
      Array [
        "Hello 1",
        "Hello 2",
      ]
    `);

  expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  expect(ctx.onRequestSpy.mock.calls[0]![0].url).toMatchInlineSnapshot(
    `"/hello,hello?batch=1&input=%7B%220%22%3A%221%22%2C%221%22%3A%222%22%7D"`,
  );
});

test('batching disabled', async () => {
  await using ctx = testServerAndClientResource(router, {
    server: {
      allowBatching: false,
    },
    clientLink: 'httpBatchLink',
  });

  const err = await waitError(
    Promise.all([ctx.client.hello.query('1'), ctx.client.hello.query('2')]),
    TRPCClientError<typeof router>,
  );
  expect(err.data?.code).toMatchInlineSnapshot(`"BAD_REQUEST"`);
  expect(err.data?.httpStatus).toMatchInlineSnapshot(`400`);
  expect(err.message).toMatchInlineSnapshot(
    `"Batching is not enabled on the server"`,
  );

  expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  expect(ctx.onRequestSpy.mock.calls[0]![0].url).toMatchInlineSnapshot(
    `"/hello,hello?batch=1&input=%7B%220%22%3A%221%22%2C%221%22%3A%222%22%7D"`,
  );
  ctx;
});
