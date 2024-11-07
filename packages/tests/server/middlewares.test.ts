import { experimental_trpcMiddleware, initTRPC } from '@trpc/server';

test('decorate independently', () => {
  type User = {
    id: string;
    name: string;
  };
  type Context = {
    user: User;
  };
  type Meta = {
    // ..
  };
  const t = initTRPC.meta<Meta>().context<Context>().create();

  const fooMiddleware = t.middleware((opts) => {
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    return opts.next({
      ctx: {
        // ...opts.ctx,
        foo: 'foo' as const,
      },
    });
  });

  t.procedure.use(fooMiddleware).query((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: User;
      foo: 'foo';
    }>();
  });

  fooMiddleware;
  // ^?

  const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: User;
      foo: 'foo';
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const bazMiddleware = barMiddleware.unstable_pipe((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: User;
      foo: 'foo';
      bar: 'bar';
    }>();
    return opts.next({
      ctx: {
        baz: 'baz' as const,
      },
    });
  });

  t.procedure.use(bazMiddleware).query(({ ctx }) => {
    expectTypeOf(ctx).toEqualTypeOf<{
      user: User;
      foo: 'foo';
      bar: 'bar';
      baz: 'baz';
    }>();
  });
});

describe('standalone middleware', () => {
  type Context = {
    foo: 'foo';
  };
  type User = {
    id: string;
  };
  const t = initTRPC.context<Context>().create();

  test('without ctx', () => {
    const addBarToCtxMiddleware = experimental_trpcMiddleware().create(
      (opts) => {
        expectTypeOf(opts.ctx).toEqualTypeOf<object | {}>();
        return opts.next({
          ctx: {
            bar: 'bar' as const,
          },
        });
      },
    );

    t.procedure.use(addBarToCtxMiddleware).query((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: 'foo';
        bar: 'bar';
      }>();
    });
  });

  test('with context', () => {
    const barNeedsFoo = experimental_trpcMiddleware<{
      ctx: { foo: 'foo' };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: 'foo';
      }>();
      return opts.next({
        ctx: {
          bar: 'bar' as const,
        },
      });
    });

    t.procedure.use(barNeedsFoo).query((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: 'foo';
        bar: 'bar';
      }>();
    });
  });

  test('mismatching context', () => {
    const barNeedsSomethingElse = experimental_trpcMiddleware<{
      ctx: { notFound: true };
    }>().create((opts) => {
      opts.ctx.notFound;
      //    ^?
      return opts.next({
        ctx: {
          bar: 'bar' as const,
        },
      });
    });

    // @ts-expect-error: notFound is not in context
    t.procedure.use(barNeedsSomethingElse);
  });

  test('in middleware chain', () => {
    const needsUser = experimental_trpcMiddleware<{
      ctx: { user: User };
    }>().create((opts) => {
      opts.ctx.user.id;
      //    ^?
      return opts.next({
        ctx: {
          bar: 'bar' as const,
        },
      });
    });

    const withUser = t.procedure.use((opts) => {
      const user: User = {
        id: 'id',
      };
      return opts.next({
        ctx: {
          user,
        },
      });
    });

    withUser.use(needsUser).query((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: 'foo';
        user: User;
        bar: 'bar';
      }>();
    });
  });

  test('in pipe', () => {
    const needsUser = experimental_trpcMiddleware<{
      ctx: { user: User };
    }>().create((opts) => {
      opts.ctx.user.id;
      //    ^?
      return opts.next({
        ctx: {
          bar: 'bar' as const,
        },
      });
    });

    const withUser = t.middleware((opts) => {
      const user: User = {
        id: 'id',
      };
      return opts.next({
        ctx: {
          user,
        },
      });
    });

    withUser.unstable_pipe(needsUser).unstable_pipe((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        foo: 'foo';
        user: User;
        bar: 'bar';
      }>();
      return opts.next();
    });
  });
});

test('pipe middlewares - inlined', async () => {
  const t = initTRPC
    .context<{
      init: 'init';
    }>()
    .create();

  const fooMiddleware = t.middleware((opts) => {
    return opts.next({
      ctx: {
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      foo: 'foo';
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const bazMiddleware = barMiddleware.unstable_pipe((opts) => {
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      foo: 'foo';
      bar: 'bar';
    }>();
    return opts.next({
      ctx: {
        baz: 'baz' as const,
      },
    });
  });

  const testProcedure = t.procedure.use(bazMiddleware);
  const router = t.router({
    test: testProcedure.query(({ ctx }) => {
      expect(ctx).toEqual({
        init: 'init',
        foo: 'foo',
        bar: 'bar',
        baz: 'baz',
      });
      expectTypeOf(ctx).toEqualTypeOf<{
        init: 'init';
        foo: 'foo';
        bar: 'bar';
        baz: 'baz';
      }>();

      return ctx;
    }),
  });

  const caller = router.createCaller({
    init: 'init',
  });

  expect(await caller.test()).toMatchInlineSnapshot(`
    Object {
      "bar": "bar",
      "baz": "baz",
      "foo": "foo",
      "init": "init",
    }
  `);
});

test('pipe middlewares - standalone', async () => {
  const t = initTRPC
    .context<{
      init: 'init';
    }>()
    .create();

  const fooMiddleware = t.middleware((opts) => {
    return opts.next({
      ctx: {
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = t.middleware((opts) => {
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const bazMiddleware = fooMiddleware
    .unstable_pipe(barMiddleware)
    .unstable_pipe((opts) => {
      expectTypeOf(opts.ctx).toMatchTypeOf<{
        foo: 'foo';
        bar: 'bar';
      }>();
      return opts.next({
        ctx: {
          baz: 'baz' as const,
        },
      });
    });

  const testProcedure = t.procedure.use(bazMiddleware);
  const router = t.router({
    test: testProcedure.query(({ ctx }) => {
      expect(ctx).toEqual({
        init: 'init',
        foo: 'foo',
        bar: 'bar',
        baz: 'baz',
      });
      expectTypeOf(ctx).toEqualTypeOf<{
        init: 'init';
        foo: 'foo';
        bar: 'bar';
        baz: 'baz';
      }>();

      return ctx;
    }),
  });

  const caller = router.createCaller({
    init: 'init',
  });

  expect(await caller.test()).toMatchInlineSnapshot(`
    Object {
      "bar": "bar",
      "baz": "baz",
      "foo": "foo",
      "init": "init",
    }
  `);
});

test('pipe middlewares - failure', async () => {
  const t = initTRPC
    .context<{
      init: {
        a: 'a';
        b: 'b';
        c: {
          d: 'd';
          e: 'e';
        };
      };
    }>()
    .create();

  const fooMiddleware = t.middleware((opts) => {
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      init: { a: 'a'; b: 'b'; c: { d: 'd'; e: 'e' } };
    }>();
    opts.ctx.init.a;
    return opts.next({
      ctx: {
        init: { a: 'a' as const },
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = t.middleware((opts) => {
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      init: { a: 'a'; b: 'b'; c: { d: 'd'; e: 'e' } };
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  // @ts-expect-error barMiddleware accessing invalid property
  const bazMiddleware = fooMiddleware.unstable_pipe(barMiddleware);

  const testProcedure = t.procedure.use(bazMiddleware);
  testProcedure.query(({ ctx }) => {
    expectTypeOf(ctx).toEqualTypeOf<{
      init: { a: 'a' };
      foo: 'foo';
      bar: 'bar';
    }>();
  });
});

test('pipe middlewares - override', async () => {
  const t = initTRPC
    .context<{
      init: {
        foundation: 'foundation';
      };
    }>()
    .create();

  const fooMiddleware = t.middleware((opts) => {
    return opts.next({
      ctx: {
        init: 'override' as const,
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
    // @ts-expect-error foundation has been overwritten
    opts.ctx.init.foundation;
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      init: 'override';
      foo: 'foo';
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const testProcedure = t.procedure.use(barMiddleware);
  const router = t.router({
    test: testProcedure.query(({ ctx }) => {
      expect(ctx).toEqual({
        init: 'override',
        foo: 'foo',
        bar: 'bar',
      });
      expectTypeOf(ctx).toEqualTypeOf<{
        init: 'override';
        foo: 'foo';
        bar: 'bar';
      }>();

      return ctx;
    }),
  });

  const caller = router.createCaller({
    init: {
      foundation: 'foundation',
    },
  });

  expect(await caller.test()).toMatchInlineSnapshot(`
    Object {
      "bar": "bar",
      "foo": "foo",
      "init": "override",
    }
  `);
});

test('pipe middlewares - failure', async () => {
  const t = initTRPC
    .context<{
      init: {
        a: 'a';
        b: 'b';
      };
    }>()
    .create();

  const fooMiddleware = t.middleware((opts) => {
    return opts.next({
      ctx: {
        init: 'override' as const,
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      init: 'override';
      foo: 'foo';
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const testProcedure = t.procedure.use(barMiddleware);
  const router = t.router({
    test: testProcedure.query(({ ctx }) => {
      expect(ctx).toEqual({
        init: 'override',
        foo: 'foo',
        bar: 'bar',
      });
      expectTypeOf(ctx).toEqualTypeOf<{
        init: 'override';
        foo: 'foo';
        bar: 'bar';
      }>();

      return ctx;
    }),
  });

  const caller = router.createCaller({
    init: {
      a: 'a',
      b: 'b',
    },
  });

  expect(await caller.test()).toMatchInlineSnapshot(`
    Object {
      "bar": "bar",
      "foo": "foo",
      "init": "override",
    }
  `);
});
test('meta', () => {
  type Meta = {
    permissions: string[];
  };
  const t = initTRPC.meta<Meta>().create();

  t.middleware(({ meta, next }) => {
    expectTypeOf(meta).toMatchTypeOf<Meta | undefined>();

    return next();
  });
});
