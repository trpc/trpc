import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

describe('no transformer specified', () => {
  test('it works', async () => {
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

    await using ctx = testServerAndClientResource(appRouter);
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
  test('it works', async () => {
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

    await using ctx = testServerAndClientResource(appRouter);
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
        "arrayWithUndefined": Array [
          1,
          undefined,
          2,
        ],
        "date": 1970-01-01T00:00:00.000Z,
        "map": Map {
          "foo" => "bar",
        },
        "set": Set {
          "foo",
          "bar",
        },
      }
    `);
  });
});
