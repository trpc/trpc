/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';

describe('no transformer specified', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();

      const appRouter = t.router({
        happy: t.procedure.query(() => ({
          map: new Map<string, string>([['foo', 'bar']]),
          set: new Set<string>(['foo', 'bar']),
          date: new Date(0),
          fn: () => {
            return 'hello';
          },
          arrayWithUndefined: [1, undefined, 2],
        })),
      });
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();
  test('it works', async () => {
    const result = await ctx.proxy.happy.query();

    expectTypeOf(result.date).toBeString();
    result.set;
    //     ^?

    result.map;
    //     ^?
    expectTypeOf(result).toMatchTypeOf<{
      date: string;
      map: {};
      set: {};
    }>();
    expectTypeOf(result.arrayWithUndefined);

    expect(result).toMatchInlineSnapshot(`
      Object {
        "date": "1970-01-01T00:00:00.000Z",
        "map": Object {},
        "set": Object {},
      }
    `);
  });
});
