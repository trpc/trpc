import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';

test('meta is "Partial<Meta> | undefined" in a middleware where defaultMeta or procedure.meta() has not injected metadata', () => {
  type Meta = {
    permissions: string[];
  };
  const t = initTRPC.meta<Meta>().create();

  t.middleware((opts) => {
    expectTypeOf(opts.meta).toEqualTypeOf<Partial<Meta> | undefined>();

    return opts.next();
  });
});

describe('meta', () => {
  type Meta = {
    foo: 'bar';
  };
  const t = initTRPC.meta<Meta>().create();

  const ctx = konn()
    .beforeEach(() => {
      const middlewareCalls = vi.fn((_opts: Partial<Meta> | undefined) => {
        // noop
      });
      const baseProc = t.procedure.use(({ next, meta }) => {
        middlewareCalls(meta);
        return next();
      });

      const appRouter = t.router({
        withMeta: baseProc
          .meta({
            foo: 'bar',
          })
          .query(() => {
            return null;
          }),
        noMeta: baseProc.query(() => {
          return null;
        }),
      });
      const opts = routerToServerAndClientNew(appRouter);

      return { ...opts, middlewareCalls };
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();
  it('is available in middlewares', async () => {
    await ctx.proxy.noMeta.query();
    await ctx.proxy.withMeta.query();
    await ctx.proxy.noMeta.query();
    await ctx.proxy.withMeta.query();

    expect(ctx.middlewareCalls.mock.calls.map((calls) => calls[0])).toEqual([
      undefined,
      { foo: 'bar' },
      undefined,
      { foo: 'bar' },
    ]);
  });

  it('is queryable in _def', async () => {
    const meta = ctx.router.withMeta._def.meta;
    expectTypeOf(meta).toEqualTypeOf<Meta | undefined>();
    expect(meta).toEqual({
      foo: 'bar',
    });
  });
});
