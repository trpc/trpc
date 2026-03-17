import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  ok: t.procedure.input(z.string()).query((opts) => `Hello ${opts.input}`),
  failing: t.procedure.input(z.string()).query(() => {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'This procedure fails',
    });
  }),
});

test('batch stream error on 2nd call returns correct error path', async () => {
  await using ctx = testServerAndClientResource(router, {
    server: {},
    clientLink: 'httpBatchStreamLink',
  });

  const results = await Promise.allSettled([
    ctx.client.ok.query('first'),
    ctx.client.failing.query('second'),
  ]);

  // First call should succeed
  expect(results[0]).toMatchObject({
    status: 'fulfilled',
    value: 'Hello first',
  });

  // Second call should fail with the correct procedure path
  expect(results[1].status).toBe('rejected');
  const error = (results[1] as PromiseRejectedResult).reason as TRPCClientError<
    typeof router
  >;
  expect(error).toBeInstanceOf(TRPCClientError);
  expect(error.data?.path).toBe('failing');
});
