import { TRPCError, initTRPC } from '@trpc/server/src';
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

  // TODO
  // 1. test type in resolver -- DONE
  // 2. snapshot ctx in resolver

  t.procedure
    .use(barMiddleware._self.piped ?? barMiddleware._self)
    .query(({ ctx }) => {
      expectTypeOf(ctx.user).toMatchTypeOf<User>();
    });
});

test.only('resolver context', async () => {
  const t = initTRPC.create();

  const fooMiddleware = t.middleware((opts) => {
    console.log('foo');
    return opts.next({
      ctx: {
        foo: 'foo' as const,
      },
    });
  });

  const barMiddleware = fooMiddleware.pipe((opts) => {
    opts.ctx.foo;
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      foo: 'foo';
    }>();
    console.log('bar');
    return opts.next({
      ctx: {
        bar: 'bar' as const,
      },
    });
  });

  const bazMiddleware = barMiddleware.pipe((opts) => {
    opts.ctx.foo;
    expectTypeOf(opts.ctx).toMatchTypeOf<{
      foo: 'foo';
      bar: 'bar';
    }>();
    console.log('baz');
    return opts.next({
      ctx: {
        baz: 'baz' as const,
      },
    });
  });

  const testProcedure = t.procedure.use(
    bazMiddleware._self.piped ?? bazMiddleware._self,
  );
  const router = t.router({
    test: testProcedure.query(({ ctx }) => {
      expectTypeOf(ctx).toMatchTypeOf<{
        foo: 'foo';
        bar: 'bar';
        baz: 'baz';
      }>();
    }),
  });

  // validate middlewares are called in order
  // const caller = router.createCaller({});
  // const result = await caller.test();
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
