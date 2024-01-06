import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import superjson from 'superjson';

describe('no transformer specified', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();

      const appRouter = t.router({
        happy: t.procedure.query(() => {
          return {
            map: new Map<string, string>([['foo', 'bar']]),
            set: new Set<string>(['foo', 'bar']),
            date: new Date(0),
            fn: () => {
              return 'hello';
            },
            arrayWithUndefined: [1, undefined, 2],
          };
        }),
      });
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();
  test('it works', async () => {
    const result = await ctx.client.happy.query();

    expectTypeOf(result).not.toBeAny();

    expectTypeOf(result.date).toBeString();
    result.set;
    //     ^?

    result.map;
    //     ^?
    expectTypeOf(result).toMatchTypeOf<{
      date: string;
      map: object;
      set: object;
    }>();
    expectTypeOf(result.arrayWithUndefined);
    //                     ^?

    expect(result).toMatchInlineSnapshot(`
      Object {
        "arrayWithUndefined": Array [
          1,
          null,
          2,
        ],
        "date": "1970-01-01T00:00:00.000Z",
        "map": Object {},
        "set": Object {},
      }
    `);
  });
});

describe('with transformer specified', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        transformer: superjson,
      });

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
    const result = await ctx.client.happy.query();

    expectTypeOf(result.date).toEqualTypeOf<Date>();
    result.set;
    //     ^?

    result.map;
    //     ^?
    expectTypeOf(result).toMatchTypeOf<{
      date: Date;
      map: Map<string, string>;
      set: Set<string>;
    }>();
    //                     ^?

    expect(result).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "arrayWithUndefined": Array [
            1,
            null,
            2,
          ],
          "date": "1970-01-01T00:00:00.000Z",
          "map": Array [
            Array [
              "foo",
              "bar",
            ],
          ],
          "set": Array [
            "foo",
            "bar",
          ],
        },
        "meta": Object {
          "values": Object {
            "arrayWithUndefined.1": Array [
              "undefined",
            ],
            "date": Array [
              "Date",
            ],
            "map": Array [
              "map",
            ],
            "set": Array [
              "set",
            ],
          },
        },
      }
    `);
  });
});
