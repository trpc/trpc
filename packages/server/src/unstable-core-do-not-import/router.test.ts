import { initTRPC } from '..';
import { lazy } from './router';

const t = initTRPC.create();

describe('router', () => {
  test('is a reserved word', async () => {
    expect(() => {
      return t.router({
        then: t.procedure.query(() => 'hello'),
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Reserved words used in \`router({})\` call: then]`,
    );
  });

  // Regression https://github.com/trpc/trpc/pull/2562
  test('because it creates async fns that returns proxy objects', async () => {
    const appRouter = t.router({});
    const asyncFnThatReturnsCaller = async () => appRouter.createCaller({});

    await asyncFnThatReturnsCaller();
  });

  test('should not duplicate key', async () => {
    expect(() =>
      t.router({
        foo: t.router({
          '.bar': t.procedure.query(() => 'bar' as const),
        }),
        'foo.': t.router({
          bar: t.procedure.query(() => 'bar' as const),
        }),
      }),
    ).toThrow('Duplicate key: foo..bar');
  });
});

describe('lazy loading routers', () => {
  test('smoke test', async () => {
    const t = initTRPC.create();

    const child = lazy(async () =>
      t.router({
        foo: t.procedure.query(() => 'bar'),
      }),
    );
    const router = t.router({
      child,
    });

    const caller = router.createCaller({});

    expect(await caller.child.foo()).toBe('bar');
  });

  test('nested routers', async () => {
    const t = initTRPC.create();

    const router = t.router({
      root: t.procedure.query(() => 'root procedure'),
      child: lazy(async () =>
        t.router({
          grandchild: lazy(async () =>
            t.router({
              foo: t.procedure.query(() => 'bar'),
              baz: t.procedure.query(() => 'baz'),
            }),
          ),
        }),
      ),
    });

    const caller = router.createCaller({});

    // No procedures loaded yet
    expect(router._def.procedures).toMatchInlineSnapshot(`
      Object {
        "root": [Function],
      }
    `);

    expect(await caller.child.grandchild.foo()).toBe('bar');

    // Procedures loaded
    expect(router._def.procedures).toMatchInlineSnapshot(`
      Object {
        "child.grandchild.baz": [Function],
        "child.grandchild.foo": [Function],
        "root": [Function],
      }
    `);
  });

  // regression: https://github.com/trpc/trpc/issues/6469
  test('parallel loading', async () => {
    const t = initTRPC.create();

    const child = lazy(async () =>
      t.router({
        one: t.procedure.query(() => 'one'),
        two: t.procedure.query(() => 'two'),
      }),
    );
    const router = t.router({
      child,
    });

    const caller = router.createCaller({});

    const parallel = Promise.all([caller.child.one(), caller.child.two()]);

    expect(await parallel).toEqual(['one', 'two']);
  });
});
