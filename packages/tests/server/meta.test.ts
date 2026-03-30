import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';

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
  it('is available in middlewares', async () => {
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

    await using ctx = testServerAndClientResource(appRouter);

    await ctx.client.noMeta.query();
    await ctx.client.withMeta.query();
    await ctx.client.noMeta.query();
    await ctx.client.withMeta.query();

    expect(middlewareCalls.mock.calls.map((calls) => calls[0])).toEqual([
      undefined,
      { foo: 'bar' },
      undefined,
      { foo: 'bar' },
    ]);
  });
});
