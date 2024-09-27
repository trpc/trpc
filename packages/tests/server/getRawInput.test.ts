import { waitError } from './___testHelpers';
import type { TRPCError } from '@trpc/server';
import { initTRPC } from '@trpc/server';

test('middleware swap', async () => {
  const t = initTRPC.create();
  const router = t.router({
    test: t.procedure
      .use((opts) =>
        opts.next({
          getRawInput: () => Promise.resolve('foo'),
        }),
      )
      .use((opts) => {
        const raw = opts.getRawInput();
        return opts.next({
          input: raw,
        });
      })
      .query((opts) => opts.input),
  });

  const caller = router.createCaller({});

  const result = await caller.test();

  expect(result).toBe('foo');
});

test('untyped caller', async () => {
  const t = initTRPC.create();
  const router = t.router({
    test: t.procedure
      .use((opts) => {
        const raw = opts.getRawInput();
        return opts.next({
          input: raw,
        });
      })
      .query((opts) => opts.input),
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
    test: t.procedure
      .use((opts) => {
        const raw = opts.getRawInput();
        return opts.next({
          input: raw,
        });
      })
      .query((opts) => opts.input),
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
