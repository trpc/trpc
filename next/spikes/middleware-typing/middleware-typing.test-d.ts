import { describe, expectTypeOf, test } from 'vite-plus/test';
import {
  initTrpc,
  middleware,
  schema,
  type,
  type inferInput,
  type inferOutput,
} from './core.ts';

interface Db {
  org(id: string): Promise<{ id: string; name: string }>;
}
interface Post {
  id: string;
  title: string;
}
declare const kv: { get(key: string): Promise<Post | undefined> };

const t = initTrpc<{
  ctx: { db: Db; user?: { id: string } };
  meta: { auth?: boolean };
}>();

describe('05 (b): type<T>()', () => {
  test('types input without a validator', () => {
    const p = t.procedure.input(type<{ id: string }>()).query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<{ id: string }>();
      return input.id;
    });
    expectTypeOf<inferInput<typeof p>>().toEqualTypeOf<{ id: string }>();
  });
});

describe('05 (c) C-A: input chaining', () => {
  test('object inputs merge, client input uses schema input types', () => {
    const p = t.procedure
      .input(schema<{ orgId: string }>())
      .input(schema<{ at: Date }, { at: string }>())
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ orgId: string; at: Date }>();
        return 1;
      });
    expectTypeOf<inferInput<typeof p>>().toEqualTypeOf<{
      orgId: string;
      at: string;
    }>();
  });

  test('middleware sees the inputs declared so far', () => {
    t.procedure
      .use(({ input, next }) => {
        expectTypeOf(input).toEqualTypeOf<undefined>();
        return next();
      })
      .input(schema<{ orgId: string }>())
      .use(({ input, next }) => {
        expectTypeOf(input).toEqualTypeOf<{ orgId: string }>();
        return next();
      })
      .input(schema<{ limit: number }>())
      .use(({ input, next }) => {
        expectTypeOf(input).toEqualTypeOf<{ orgId: string; limit: number }>();
        return next();
      });
  });

  test('non-object and conflicting chains are type errors', () => {
    // @ts-expect-error only object schemas can be chained
    t.procedure.input(schema<{ a: string }>()).input(schema<string>());
    // @ts-expect-error the previous input is not an object
    t.procedure.input(schema<string>()).input(schema<{ a: string }>());
    // @ts-expect-error `id` is string in one schema and number in the other
    t.procedure.input(schema<{ id: string }>()).input(schema<{ id: number }>());
    // compatible overlap is fine
    t.procedure
      .input(schema<{ id: string }>())
      .input(schema<{ id: 'a' | 'b' }>());
  });
});

describe('06 (d): standalone dependency-declaring middleware', () => {
  const withOrg = middleware<{ ctx: { db: Db }; input: { orgId: string } }>()(
    async ({ ctx, input, next }) =>
      next({ ctx: { org: await ctx.db.org(input.orgId) } }),
  );

  test('use() accepts it when ctx and input satisfy the requirements', () => {
    t.procedure
      .input(schema<{ orgId: string; limit: number }>())
      .use(withOrg)
      .query(({ ctx }) => {
        expectTypeOf(ctx.org).toEqualTypeOf<{ id: string; name: string }>();
        expectTypeOf(ctx.db).toEqualTypeOf<Db>();
        return ctx.org.name;
      });
  });

  test('missing input or ctx is a type error at use()', () => {
    // @ts-expect-error input is `undefined` here: no `.input()` yet
    t.procedure.use(withOrg);
    // @ts-expect-error `orgId` is missing from the input
    t.procedure.input(schema<{ id: string }>()).use(withOrg);

    const noDb = initTrpc<{ ctx: { user?: { id: string } } }>();
    // @ts-expect-error ctx lacks `db`
    noDb.procedure.input(schema<{ orgId: string }>()).use(withOrg);
  });

  test('mapInput adapts the input shape', () => {
    t.procedure
      .input(schema<{ id: string }>())
      .use(withOrg, (input) => ({ orgId: input.id }))
      .query(({ ctx }) => ctx.org.id);

    t.procedure
      .input(schema<{ id: string }>())
      // @ts-expect-error mapInput must return the middleware's input
      .use(withOrg, (input) => ({ org: input.id }));
  });

  test('a middleware with no requirements works anywhere', () => {
    const timing = middleware()(async ({ path, next }) => {
      const r = await next();
      expectTypeOf(path).toBeString();
      return r;
    });
    t.procedure.use(timing).query(() => 1);
  });
});

describe('06 (c): ok() short-circuit', () => {
  test('a short-circuit value compatible with the resolver output is fine', () => {
    const p = t.procedure
      .input(schema<{ id: string }>())
      .use(async ({ input, next, ok }) => {
        const hit = await kv.get(input.id);
        if (hit) return ok(hit);
        return next();
      })
      .query(async (): Promise<Post> => ({ id: '1', title: 't' }));
    expectTypeOf<inferOutput<typeof p>>().toEqualTypeOf<Post>();
  });

  test('an incompatible short-circuit value is an error on the resolver', () => {
    t.procedure
      .use(({ next, ok }) =>
        Math.random() > 0.5 ? ok({ cached: true }) : next(),
      )
      // @ts-expect-error the middleware may return `{ cached: true }`
      .query(async (): Promise<Post> => ({ id: '1', title: 't' }));
  });

  test('arrays in a short-circuit value are not narrowed to readonly tuples', () => {
    t.procedure
      .use(({ next, ok }) =>
        Math.random() > 0.5 ? ok({ tags: ['a'] }) : next(),
      )
      .query((): { tags: string[] } => ({ tags: [] }));
  });

  test('with .output() the check runs against the declared output', () => {
    t.procedure
      .output(schema<Post>())
      .use(({ next, ok }) =>
        Math.random() > 0.5 ? ok({ id: '1', title: 'c' }) : next(),
      )
      .query(() => ({ id: '2', title: 'r' }));

    t.procedure
      .output(schema<Post>())
      .use(({ next, ok }) => (Math.random() > 0.5 ? ok({ id: 1 }) : next()))
      // @ts-expect-error `{ id: 1 }` is not a Post
      .query(() => ({ id: '2', title: 'r' }));
  });

  test('a standalone cache middleware is generic over output', () => {
    const cache = middleware()(async ({ path, next, ok }) => {
      const hit = await kv.get(path);
      return hit ? ok(hit) : next();
    });
    t.procedure.use(cache).query((): Post => ({ id: '1', title: 't' }));
    // @ts-expect-error the cache returns a Post, this resolver returns a number
    t.procedure.use(cache).query(() => 1);
  });
});
