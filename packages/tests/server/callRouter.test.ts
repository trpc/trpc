import { initTRPC } from '@trpc/server';

// FIXME: should we deprecate this?
test('call proc directly', async () => {
  const t = initTRPC.create();
  const router = t.router({
    sub: t.router({
      hello: t.procedure.query(() => 'hello'),
    }),
  });

  const result = await router.sub.hello({
    ctx: {},
    path: 'asd',
    type: 'query',
    getRawInput: async () => ({}),
    signal: undefined,
    batchIndex: 0,
  });

  expect(result).toBe('hello');
});
