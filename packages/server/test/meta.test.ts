import { routerToServerAndClientNew } from './___testHelpers';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import { initTRPC } from '../src';

test('meta is undefined in a middleware', () => {
  type Meta = {
    permissions: string[];
  };
  const t = initTRPC.meta<Meta>().create();

  t.middleware(({ meta, next }) => {
    expectTypeOf(meta).toMatchTypeOf<Meta | undefined>();

    return next();
  });
});

describe('meta in avail', () => {
  type Meta = {
    foo: 'bar';
  };
  const t = initTRPC.meta<Meta>().create();

  const ctx = konn()
    .beforeEach(() => {
      const middlewareCalls = jest.fn((opts: Meta | undefined) => {
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
          .query((opts) => {
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
  it('is avail', async () => {
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
});
