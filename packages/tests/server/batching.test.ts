import { routerToServerAndClientNew } from './___testHelpers';
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
  const ctx = routerToServerAndClientNew(router, {
    server: {},
  });
  const { client } = ctx;

  const results = await Promise.all([
    client.hello.query('1'),
    client.hello.query('2'),
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

  await ctx.close();
});

test('batching disabled', async () => {
  const ctx = routerToServerAndClientNew(router, {
    server: {
      allowBatching: false,
    },
  });
  const { client } = ctx;

  const err = await waitError(
    Promise.all([client.hello.query('1'), client.hello.query('2')]),
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

  await ctx.close();
});

/**
 * @deprecated
 */
test('batching disabled (deprecated)', async () => {
  const ctx = routerToServerAndClientNew(router, {
    server: {
      batching: {
        enabled: false,
      },
    },
  });
  const { client } = ctx;

  const err = await waitError(
    Promise.all([client.hello.query('1'), client.hello.query('2')]),
    TRPCClientError<typeof router>,
  );

  expect(err.data?.code).toMatchInlineSnapshot(`"BAD_REQUEST"`);
  await ctx.close();
});
