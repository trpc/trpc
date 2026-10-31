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
  test('eager router nesting preserves lazy descendants', async () => {
    const child = t.router({
      leaf: lazy(async () =>
        t.router({
          one: t.procedure.query(() => 'one'),
          two: t.procedure.query(() => 'two'),
        }),
      ),
    });
    const router = t.router({
      first: child,
      second: t.router({ child }),
    });
    const caller = router.createCaller({});

    expect(
      await Promise.all([
        caller.first.leaf.one(),
        caller.first.leaf.two(),
        caller.second.child.leaf.one(),
      ]),
    ).toEqual(['one', 'two', 'one']);
    expect(await child.createCaller({}).leaf.two()).toBe('two');
  });

  test('lazy descendants retain dotted keys through eager and lazy nesting', async () => {
    const child = t.router({
      'group.part': {
        'leaf.name': lazy(async () =>
          t.router({ hello: t.procedure.query(() => 'world') }),
        ),
      },
    });
    const router = t.router({
      parent: lazy(async () => t.router({ child })),
    });
    const caller = router.createCaller({});

    expect(await caller.parent.child['group.part']['leaf.name'].hello()).toBe(
      'world',
    );
    const reused = t.router({ reused: router }).createCaller({});
    expect(
      await reused.reused.parent.child['group.part']['leaf.name'].hello(),
    ).toBe('world');
  });

  test('merging routers preserves lazy descendants', async () => {
    const child = t.router({
      group: {
        leaf: lazy(async () =>
          t.router({ hello: t.procedure.query(() => 'world') }),
        ),
      },
    });
    const router = t.mergeRouters(
      child,
      child,
      t.router({ sibling: t.procedure.query(() => 'sibling') }),
    );

    expect(await router.createCaller({}).group.leaf.hello()).toBe('world');
    expect(await child.createCaller({}).group.leaf.hello()).toBe('world');
  });

  test('preserves prototype-named lazy keys', async () => {
    const leaf = t.router({ hello: t.procedure.query(() => 'world') });
    const child = t.router({
      ['__proto__']: lazy(async () => leaf),
      group: { ['__proto__']: lazy(async () => leaf) },
    });
    const caller = t
      .router({ parent: lazy(async () => child) })
      .createCaller({});

    expect(await caller.parent.__proto__.hello()).toBe('world');
    expect(await caller.parent.group.__proto__.hello()).toBe('world');
  });

  // regression: sibling lazy routers where one key is a string prefix of another
  test('prefix sibling routers do not load the wrong lazy router', async () => {
    const t = initTRPC.create();

    const postLoader = vi.fn(async () =>
      t.router({
        byId: t.procedure.query(() => 'post.byId'),
      }),
    );

    const router = t.router({
      // `post` is declared first, so it is enumerated before `posts`
      post: lazy(postLoader),
      posts: lazy(async () =>
        t.router({
          list: t.procedure.query(() => 'posts.list'),
        }),
      ),
    });

    const caller = router.createCaller({});

    expect(await caller.posts.list()).toBe('posts.list');
    // the unrelated `post` loader must never run for a `posts.*` path
    expect(postLoader).not.toHaveBeenCalled();
  });

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
