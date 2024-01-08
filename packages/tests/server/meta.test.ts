import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

test('meta is undefined in a middleware', () => {
  type Meta = {
    permissions: string[];
  };
  const t = initTRPC.meta<Meta>().create();

  t.middleware((opts) => {
    expectTypeOf(opts.meta).toEqualTypeOf<Meta | undefined>();

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
      const middlewareCalls = vi.fn((_opts: Meta | undefined) => {
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
    await ctx.client.noMeta.query();
    await ctx.client.withMeta.query();
    await ctx.client.noMeta.query();
    await ctx.client.withMeta.query();

    expect(ctx.middlewareCalls.mock.calls.map((calls) => calls[0])).toEqual([
      undefined,
      { foo: 'bar' },
      undefined,
      { foo: 'bar' },
    ]);
  });
});
