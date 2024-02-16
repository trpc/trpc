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
  test('lazy child', async () => {
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

  test('lazy grandchild', async () => {
    const t = initTRPC.create();

    const router = t.router({
      child: lazy(async () =>
        t.router({
          grandchild: lazy(async () =>
            t.router({
              foo: t.procedure.query(() => 'bar'),
            }),
          ),
        }),
      ),
    });

    const caller = router.createCaller({});

    expect(router._def.record).toMatchInlineSnapshot(`Object {}`);
    expect(await caller.child.grandchild.foo()).toBe('bar');

    // (Maybe we should just delete `_.def.record`)
    expect(router._def.record).toMatchInlineSnapshot(`
      Object {
        "child": Object {
          "grandchild": Object {
            "foo": [Function],
          },
        },
      }
    `);
  });
});
