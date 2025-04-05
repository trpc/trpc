import { waitError } from '@trpc/server/__tests__/waitError';
import type { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

test('untyped caller', async () => {
  const t = initTRPC.create();
  const router = t.router({
    test: t.procedure.input(z.string()).query((opts) => opts.input),
  });

  const result = await router.test({
    getRawInput: () => Promise.resolve('foo'),
    ctx: {},
    path: 'test',
    type: 'query',
    input: 'foo',
    signal: undefined,
  });
  expect(result).toBe('foo');
});

test('getRawInput fails', async () => {
  const t = initTRPC.create();
  const router = t.router({
    test: t.procedure.input(z.string()).query((opts) => opts.input),
  });

  const result = await waitError<TRPCError>(
    router.test({
      getRawInput: () => Promise.reject(new Error('boo')),
      ctx: {},
      path: 'test',
      type: 'query',
      input: 'foo',
      signal: undefined,
    }),
  );

  expect(result.code).toBe('INTERNAL_SERVER_ERROR');
  expect(result.message).toMatchInlineSnapshot('"boo"');
});
