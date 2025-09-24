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
