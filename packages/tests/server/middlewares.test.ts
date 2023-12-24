import {
  experimental_standaloneMiddleware,
  initTRPC,
  TRPCError,
} from '@trpc/server';
import * as z from 'zod';

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

test('standalone middlewares that define the ctx/input they require and can be used in different tRPC instances', () => {
  type Human = {
    id: string;
    name: string;
  };
  type HumanContext = {
    user: Human;
  };
  const tHuman = initTRPC.context<HumanContext>().create();

  type Alien = {
    id: string;
    name: Buffer; // aliens have weird names
  };
  type AlienContext = {
    user: Alien;
    planet: 'mars' | 'venus';
  };
  const tAlien = initTRPC.context<AlienContext>().create();

  const addFooToCtxMiddleware = experimental_standaloneMiddleware().create(
    (opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<object>();
      return opts.next({
        ctx: {
          foo: 'foo' as const,
        },
      });
    },
  );

  const addUserNameLengthToCtxMiddleware = experimental_standaloneMiddleware<{
    ctx: { user: Human | Alien };
  }>().create((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: Human | Alien;
    }>();
    return opts.next({
      ctx: {
        nameLength: opts.ctx.user.name.length,
      },
    });
  });

  const determineIfUserNameIsLongMiddleware =
    experimental_standaloneMiddleware<{
      ctx: { nameLength: number };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        nameLength: number;
      }>();

      return opts.next({
        ctx: {
          nameIsLong: opts.ctx.nameLength > 10,
        },
      });
    });

  const mapUserToUserTypeMiddleware = experimental_standaloneMiddleware<{
    ctx: { user: Human | Alien };
  }>().create((opts) => {
    expectTypeOf(opts.ctx).toEqualTypeOf<{
      user: Human | Alien;
    }>();
    return opts.next({
      ctx: {
        user:
          typeof opts.ctx.user.name === 'string'
            ? ('human' as const)
            : ('alien' as const),
      },
    });
  });

  // This is not OK because determineIfUserNameIsLongMiddleware requires { nameLength: number } which is not in either context:
  tHuman.procedure.use(
    // @ts-expect-error: no user in context
    determineIfUserNameIsLongMiddleware,
  );
  tAlien.procedure.use(
    // @ts-expect-error: no user in context
    determineIfUserNameIsLongMiddleware,
  );

  // This is not OK because determineIfUserNameIsLongMiddleware requires { nameLength: number } which is not in HumanContext & { foo: string }
  tHuman.procedure
    .use(addFooToCtxMiddleware)
    // @ts-expect-error: no nameLength in context
    .use(determineIfUserNameIsLongMiddleware);

  // This is OK because the context provides { user: Human } or { user: Alien } which is what addUserNameLengthToCtx requires
  tHuman.procedure
    .use(addFooToCtxMiddleware)
    .use(addUserNameLengthToCtxMiddleware)
    // determineIfUserNameIsLongMiddleware only needs { nameLength: number }, so overwriting user is fine
    .use(mapUserToUserTypeMiddleware)
    .use(determineIfUserNameIsLongMiddleware)
    .query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        user: 'human' | 'alien';
        nameLength: number;
        nameIsLong: boolean;
        foo: 'foo';
      }>();
    });

  tAlien.procedure
    .use(addFooToCtxMiddleware)
    .use(addUserNameLengthToCtxMiddleware)
    // determineIfUserNameIsLongMiddleware only needs { nameLength: number }, so overwriting user is fine
    .use(mapUserToUserTypeMiddleware)
    .use(determineIfUserNameIsLongMiddleware)
    .query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        user: 'human' | 'alien';
        nameLength: number;
        nameIsLong: boolean;
        planet: 'mars' | 'venus';
        foo: 'foo';
      }>();
    });

  addFooToCtxMiddleware
    // This is not OK because the requirements of the later middlewares are not met
    // @ts-expect-error: No user in context at this point
    .unstable_pipe(addUserNameLengthToCtxMiddleware)
    // @ts-expect-error: No user in context at this point
    .unstable_pipe(mapUserToUserTypeMiddleware)
    .unstable_pipe(determineIfUserNameIsLongMiddleware);

  const requireUserAndAddFooToCtxMiddleware =
    experimental_standaloneMiddleware<{
      ctx: { user: Human | Alien };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        user: Human | Alien;
      }>();
      return opts.next({
        ctx: {
          foo: 'foo' as const,
        },
      });
    });

  const validPipedVersion = requireUserAndAddFooToCtxMiddleware
    .unstable_pipe(addUserNameLengthToCtxMiddleware)
    .unstable_pipe(mapUserToUserTypeMiddleware)
    .unstable_pipe(determineIfUserNameIsLongMiddleware);

  tHuman.procedure.use(validPipedVersion).query(({ ctx }) => {
    expectTypeOf(ctx).toEqualTypeOf<{
      user: 'human' | 'alien';
      nameLength: number;
      nameIsLong: boolean;
      foo: 'foo';
    }>();
  });

  tAlien.procedure.use(validPipedVersion).query(({ ctx }) => {
    expectTypeOf(ctx).toEqualTypeOf<{
      user: 'human' | 'alien';
      nameLength: number;
      nameIsLong: boolean;
      planet: 'mars' | 'venus';
      foo: 'foo';
    }>();
  });

  // Middleware chain using standalone middleware that requires a particular 'input' shape
  const ensureMagicNumberIsNotLongerThanNameLength =
    experimental_standaloneMiddleware<{
      ctx: { nameLength: number };
      input: { magicNumber: number };
    }>().create((opts) => {
      expectTypeOf(opts.ctx).toEqualTypeOf<{
        nameLength: number;
      }>();
      expectTypeOf(opts.input).toEqualTypeOf<{
        magicNumber: number;
      }>();

      if (opts.input.magicNumber > opts.ctx.nameLength) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'magicNumber is too high',
        });
      }

      return opts.next();
    });

  // This is not OK because the input is not compatible with the middleware (magicNumber must always be number)
  tHuman.procedure
    .input(z.object({ magicNumber: z.number().optional() }))
    .use(addUserNameLengthToCtxMiddleware)
    // @ts-expect-error: magicNumber is required
    .use(ensureMagicNumberIsNotLongerThanNameLength);

  // This is OK because the input is compatible with the middleware
  tHuman.procedure
    .input(z.object({ magicNumber: z.number() }))
    .use(addUserNameLengthToCtxMiddleware)
    .use(ensureMagicNumberIsNotLongerThanNameLength)
    .query(({ input, ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        user: Human;
        nameLength: number;
      }>();
      expectTypeOf(input).toEqualTypeOf<{
        magicNumber: number;
      }>();
    });

  // Middleware that defines a particular 'meta' shape
  const shamefullyLogIfProcedureIsNotCoolMiddleware =
    experimental_standaloneMiddleware<{
      meta: {
        cool: boolean;
      };
    }>().create((opts) => {
      expectTypeOf(opts.meta).toEqualTypeOf<
        | {
            cool: boolean;
          }
        | undefined
      >();

      if (!opts.meta?.cool) {
        globalThis.console.log('This procedure is not cool');
      }

      return opts.next();
    });

  // This is not OK because the meta is not compatible with the middleware (cool must always be boolean)
  const tHumanWithWrongMeta = initTRPC
    .context<HumanContext>()
    .meta<{ cool: string }>()
    .create();
  tHumanWithWrongMeta.procedure
    .meta({ cool: 'true' })
    // @ts-expect-error: cool must be boolean
    .use(shamefullyLogIfProcedureIsNotCoolMiddleware);

  // This is OK because the meta is compatible with the middleware
  const tHumanWithMeta = initTRPC
    .context<HumanContext>()
    .meta<{ cool: boolean }>()
    .create();

  tHumanWithMeta.procedure
    .meta({ cool: false })
    .use(shamefullyLogIfProcedureIsNotCoolMiddleware);

  // Works without the .meta() addition as well, since Meta is always a union with undefined
  tHumanWithMeta.procedure.use(shamefullyLogIfProcedureIsNotCoolMiddleware);
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
