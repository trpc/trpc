import { initTRPC } from '@trpc/server';

test('middleware does not leak `any` into ctx', () => {
  const t = initTRPC.context<{ base: 'base' }>().create();

  const mw = t.middleware((opts) => {
    // opts.ctx should be the base context type
    expectTypeOf(opts.ctx).toMatchTypeOf<{ base: 'base' }>();

    // add a new strongly-typed property
    return opts.next({ ctx: { extra: 'extra' as const } });
  });

  const proc = t.procedure.use(mw).query((opts) => {
    // downstream should see both base and extra, and not `any`
    expectTypeOf(opts.ctx).toMatchTypeOf<{ base: 'base'; extra: 'extra' }>();
    return null;
  });

  void proc;
});
