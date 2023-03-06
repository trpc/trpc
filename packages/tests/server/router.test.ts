import './___packages';
import { initTRPC } from '@trpc/server/src/core';

const t = initTRPC.create();

describe('router', () => {
  test('is a reserved word', async () => {
    expect(() => {
      return t.router({
        then: t.procedure.query(() => 'hello'),
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `"Reserved words used in \`router({})\` call: then"`,
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

  test('nested sub-router should be accessible', async () => {
    const router = t.router({
      foo: {
        bar: t.procedure.query(() => 'Hello I am recursive'),
      },
    });

    const caller = router.createCaller({});
    const result = await caller.foo.bar();
    expect(result).toBe('Hello I am recursive');
  });

  test('multiple nested levels of subrouter should be accessible', async () => {
    const router = t.router({
      foo: {
        bar: {
          foo: {
            bar: {
              foo: {
                bar: t.procedure.query(() => 'Hello I am recursive'),
              },
            },
          },
        },
      },
    });

    const caller = router.createCaller({});
    const result = await caller.foo.bar.foo.bar.foo.bar();
    expect(result).toBe('Hello I am recursive');
  });

  test('multiple nested levels of subrouter with different constructors should be accessible', async () => {
    const router = t.router({
      foo: {
        bar: t.router({
          foo: {
            bar: {
              foo: t.router({
                bar: t.procedure.query(() => 'Hello I am recursive'),
              }),
            },
          },
        }),
      },
    });

    const caller = router.createCaller({});
    const result = await caller.foo.bar.foo.bar.foo.bar();
    expect(result).toBe('Hello I am recursive');
  });
});
