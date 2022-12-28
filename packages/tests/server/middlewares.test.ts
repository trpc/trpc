import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';

test('decorate independently', () => {
  type User = {
    id: string;
    name: string;
  };
  type Context = {
    user: User;
  };
  const t = initTRPC.context<Context>().create();

  const fooMiddleware = t.middleware((opts) => {
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    return opts.next({
      ctx: {
        // ...opts.ctx,
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = fooMiddleware.pipe((opts) => {
    opts.ctx.foo;
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      foo: 'foo';
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const bazMiddleware = barMiddleware.pipe((opts) => {
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    expectTypeOf(opts.ctx.foo).toMatchTypeOf<'foo'>();
    expectTypeOf(opts.ctx.bar).toMatchTypeOf<'bar'>();
    return opts.next({
      ctx: {
        baz: 'baz' as const,
      },
    });
  });

  t.procedure.use(bazMiddleware).query(({ ctx }) => {
    expectTypeOf(ctx.user).toMatchTypeOf<User>();
  });
});

test('resolver context', async () => {
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

  const barMiddleware = fooMiddleware.pipe((opts) => {
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      foo: 'foo';
    }>();
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const bazMiddleware = barMiddleware.pipe((opts) => {
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
