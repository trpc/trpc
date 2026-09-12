import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type {
  DefaultErrorShape,
  inferProcedureErrorShape,
} from '@trpc/server/unstable-core-do-not-import';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

class PaymentRequiredError extends Error {
  constructor(public readonly amountDue: number) {
    super('Payment required');
  }
}

const t = initTRPC.create({
  errorFormatter(opts) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        fromGlobalFormatter: true as const,
      },
    };
  },
});

const rateLimitedProcedure = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return opts.shape;
});

const billedProcedure = rateLimitedProcedure.errors((opts) => {
  if (opts.error.cause instanceof PaymentRequiredError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'PAYMENT_REQUIRED' as const,
        amountDue: opts.error.cause.amountDue,
      },
    };
  }
  return opts.shape;
});

const appRouter = t.router({
  plain: t.procedure.query((): string => {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Fails' });
  }),
  rateLimited: rateLimitedProcedure.query((): string => {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(5_000),
    });
  }),
  rateLimitedButUnrelatedError: rateLimitedProcedure.query((): string => {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Fails' });
  }),
  billed: billedProcedure.mutation((): string => {
    throw new TRPCError({
      code: 'PAYMENT_REQUIRED',
      cause: new PaymentRequiredError(42),
    });
  }),
  billedButRateLimited: billedProcedure.mutation((): string => {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      cause: new RateLimitError(1_000),
    });
  }),
});

type Root = (typeof appRouter)['_def']['_config']['$types'];
type Record = (typeof appRouter)['_def']['record'];

describe('types', () => {
  test('a procedure without its own formatter keeps the global shape', () => {
    type Shape = inferProcedureErrorShape<Root, Record['plain']>;

    expectTypeOf<Shape['data']['fromGlobalFormatter']>().toEqualTypeOf<true>();
    // @ts-expect-error - `kind` is only added by the procedure-level formatters
    type _ = Shape['data']['kind'];
  });

  test('a procedure-level formatter unions its shape with the global one', () => {
    type Shape = inferProcedureErrorShape<Root, Record['rateLimited']>;

    expectTypeOf<Shape['data']['fromGlobalFormatter']>().toEqualTypeOf<true>();

    const data = {} as Shape['data'];
    if ('kind' in data) {
      expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
      expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
    }
  });

  test('chaining widens the error union', () => {
    type Shape = inferProcedureErrorShape<Root, Record['billed']>;

    const data = {} as Shape['data'];
    if ('kind' in data) {
      data.kind satisfies 'RATE_LIMIT' | 'PAYMENT_REQUIRED';
      // @ts-expect-error - both variants are in the union
      data.kind satisfies 'RATE_LIMIT';

      if (data.kind === 'PAYMENT_REQUIRED') {
        expectTypeOf(data.amountDue).toEqualTypeOf<number>();
        // @ts-expect-error - only on the rate limit variant
        data.retryAfterMs;
      }
    }
  });

  test('the router-wide error shape is unaffected', () => {
    expectTypeOf<Root['errorShape']>().toMatchTypeOf<DefaultErrorShape>();
    expectTypeOf<
      Root['errorShape']['data']['fromGlobalFormatter']
    >().toEqualTypeOf<true>();
    // @ts-expect-error - procedure-level shapes don't leak to the router
    type _ = Root['errorShape']['data']['kind'];
  });
});

describe.each([
  'httpLink',
  'httpBatchLink',
  'httpBatchStreamLink',
  'wsLink',
] as const)('runtime (%s)', (clientLink) => {
  test('procedure without a formatter gets the global shape only', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(ctx.client.plain.query(), TRPCClientError);

    expect(err.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      fromGlobalFormatter: true,
    });
    expect(err.data).not.toHaveProperty('kind');
  });

  test('procedure-level formatter runs on top of the global one', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(
      ctx.client.rateLimited.query(),
      TRPCClientError,
    );

    expect(err.data).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      fromGlobalFormatter: true,
      kind: 'RATE_LIMIT',
      retryAfterMs: 5_000,
    });
  });

  test('a formatter that passes the shape through is a no-op', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(
      ctx.client.rateLimitedButUnrelatedError.query(),
      TRPCClientError,
    );

    expect(err.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      fromGlobalFormatter: true,
    });
    expect(err.data).not.toHaveProperty('kind');
  });

  test('chained formatters all run, in order', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const paymentError = await waitError(
      ctx.client.billed.mutate(),
      TRPCClientError,
    );
    expect(paymentError.data).toMatchObject({
      code: 'PAYMENT_REQUIRED',
      fromGlobalFormatter: true,
      kind: 'PAYMENT_REQUIRED',
      amountDue: 42,
    });

    const rateLimitError = await waitError(
      ctx.client.billedButRateLimited.mutate(),
      TRPCClientError,
    );
    expect(rateLimitError.data).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      fromGlobalFormatter: true,
      kind: 'RATE_LIMIT',
      retryAfterMs: 1_000,
    });
  });
});

test('errors thrown from middlewares are formatted too', async () => {
  const procedure = t.procedure
    .use((opts) => {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        cause: new RateLimitError(10),
      });
      return opts.next();
    })
    .errors((opts) => ({
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'FROM_MIDDLEWARE' as const,
      },
    }));

  const router = t.router({
    guarded: procedure.query(() => 'never'),
  });

  await using ctx = testServerAndClientResource(router);

  const err = await waitError(ctx.client.guarded.query(), TRPCClientError);

  expect(err.data).toMatchObject({
    code: 'UNAUTHORIZED',
    fromGlobalFormatter: true,
    kind: 'FROM_MIDDLEWARE',
  });
});

test('`concat()` combines the error unions of both builders', async () => {
  const a = t.procedure.errors((opts) => ({
    ...opts.shape,
    data: { ...opts.shape.data, a: true as const },
  }));
  const b = t.procedure.errors((opts) => ({
    ...opts.shape,
    data: { ...opts.shape.data, b: true as const },
  }));

  const router = t.router({
    combined: a.concat(b).query((): string => {
      throw new TRPCError({ code: 'BAD_REQUEST' });
    }),
  });

  type Shape = inferProcedureErrorShape<
    Root,
    (typeof router)['_def']['record']['combined']
  >;
  const data = {} as Shape['data'];
  if ('a' in data) {
    expectTypeOf(data.a).toEqualTypeOf<true>();
  }
  if ('b' in data) {
    expectTypeOf(data.b).toEqualTypeOf<true>();
  }

  await using ctx = testServerAndClientResource(router);

  const err = await waitError(ctx.client.combined.query(), TRPCClientError);

  expect(err.data).toMatchObject({
    a: true,
    b: true,
  });
});

describe.each(['httpSubscriptionLink', 'wsLink'] as const)(
  'subscriptions (%s)',
  (clientLink) => {
    const subRouter = t.router({
      throwsImmediately: rateLimitedProcedure.subscription(async function* () {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          cause: new RateLimitError(3_000),
        });
        yield 'never';
      }),
      throwsMidStream: rateLimitedProcedure.subscription(async function* () {
        yield 'first';
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          cause: new RateLimitError(7_000),
        });
      }),
    });

    test('errors thrown before the first value are formatted', async () => {
      await using ctx = testServerAndClientResource(subRouter, { clientLink });

      const onError = vi.fn<(err: TRPCClientError<typeof subRouter>) => void>();
      const sub = ctx.client.throwsImmediately.subscribe(undefined, {
        onError,
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });
      sub.unsubscribe();

      expect(onError.mock.calls[0]![0].data).toMatchObject({
        fromGlobalFormatter: true,
        kind: 'RATE_LIMIT',
        retryAfterMs: 3_000,
      });
    });

    test('errors thrown mid-stream are formatted', async () => {
      await using ctx = testServerAndClientResource(subRouter, { clientLink });

      const onData = vi.fn();
      const onError = vi.fn<(err: TRPCClientError<typeof subRouter>) => void>();
      const sub = ctx.client.throwsMidStream.subscribe(undefined, {
        onData,
        onError,
      });

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledTimes(1);
      });
      expect(onData).toHaveBeenCalledTimes(1);
      sub.unsubscribe();

      expect(onError.mock.calls[0]![0].data).toMatchObject({
        fromGlobalFormatter: true,
        kind: 'RATE_LIMIT',
        retryAfterMs: 7_000,
      });
    });
  },
);
