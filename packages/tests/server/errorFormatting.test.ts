import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type {
  DefaultErrorData,
  DefaultErrorShape,
} from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import { z, ZodError } from 'zod';

function isTRPCClientError<TRouter extends AnyRouter>(
  cause: unknown,
): cause is TRPCClientError<TRouter> {
  return cause instanceof TRPCClientError;
}

describe('no custom error formatter', () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new Error('Fails');
      }
      return 'never';
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('infer errors with type guard', async () => {
    const err = await waitError(ctx.client.greeting.query());

    if (!isTRPCClientError<typeof appRouter>(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
  });
});

describe('with custom error formatter', () => {
  const t = initTRPC.create({
    errorFormatter({ shape }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          foo: 'bar' as const,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new Error('Fails');
      }
      return 'never';
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('infer errors with type guard', async () => {
    const err = await waitError(ctx.client.greeting.query());

    if (!isTRPCClientError<typeof appRouter>(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
    expectTypeOf(err.data!.foo).toEqualTypeOf<'bar'>();

    err.data!.stack = '[redacted]';

    expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "foo": "bar",
        "httpStatus": 500,
        "path": "greeting",
        "stack": "[redacted]",
      }
    `);
    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32603,
        "data": Object {
          "code": "INTERNAL_SERVER_ERROR",
          "foo": "bar",
          "httpStatus": 500,
          "path": "greeting",
          "stack": "[redacted]",
        },
        "message": "Fails",
      }
    `);
  });
});

describe('custom error sub-classes', () => {
  class MyCustomAuthError extends TRPCError {
    public readonly reason;
    public constructor(opts: {
      message?: string;
      reason: 'BAD_PHONE' | 'INVALID_AREA_CODE';
      cause?: unknown;
    }) {
      super({
        ...opts,
        code: 'UNAUTHORIZED',
        message: opts.message ?? opts.reason,
      });

      this.reason = opts.reason;
    }
  }
  const t = initTRPC.create({
    errorFormatter(opts) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          reason:
            opts.error instanceof MyCustomAuthError ? opts.error.reason : null,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new MyCustomAuthError({
          reason: 'BAD_PHONE',
        });
      }
      return 'never';
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('infer errors with type guard', async () => {
    const err = await waitError(ctx.client.greeting.query());

    if (!isTRPCClientError<typeof appRouter>(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
    expectTypeOf(err.data!.reason).toEqualTypeOf<
      'BAD_PHONE' | 'INVALID_AREA_CODE' | null
    >();

    err.data!.stack = '[redacted]';

    expect(err.shape!.data.httpStatus).toBe(401);
    expect(err.shape!.data.reason).toBe('BAD_PHONE');

    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32001,
        "data": Object {
          "code": "UNAUTHORIZED",
          "httpStatus": 401,
          "path": "greeting",
          "reason": "BAD_PHONE",
          "stack": "[redacted]",
        },
        "message": "BAD_PHONE",
      }
    `);
  });
});

describe('zod errors according to docs', () => {
  const t = initTRPC.create({
    errorFormatter(opts) {
      const { shape, error } = opts;
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
              ? error.cause.flatten()
              : null,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.input(z.number().min(10)).query((opts) => opts.input),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('zod errors according to docs', async () => {
    // bad query
    const err = await waitError(ctx.client.greeting.query(5));
    assert(isTRPCClientError<typeof appRouter>(err));
    assert(err.data);
    assert(err.data.zodError);

    expectTypeOf(err.data.zodError).toMatchTypeOf<
      z.typeToFlattenedError<any>
    >();
    expect(err.data?.zodError).toMatchInlineSnapshot(`
      Object {
        "fieldErrors": Object {},
        "formErrors": Array [
          "Number must be greater than or equal to 10",
        ],
      }
    `);

    // good
    expect(await ctx.client.greeting.query(10)).toBe(10);
  });
});
