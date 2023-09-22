import { initTRPC } from '@trpc/server';
import './___packages';

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
