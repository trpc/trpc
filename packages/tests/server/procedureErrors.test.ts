import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { inferProcedureErrorShape } from '@trpc/server/unstable-core-do-not-import';

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
  return undefined;
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
  return undefined;
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
  billedButUnrelatedError: billedProcedure.mutation((): string => {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Fails' });
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

  test('a declining formatter unions its shape with the global fallback', () => {
    type Shape = inferProcedureErrorShape<Root, Record['rateLimited']>;

    const data = {} as Shape['data'];
    if ('kind' in data) {
      expectTypeOf(data.kind).toEqualTypeOf<'RATE_LIMIT'>();
      expectTypeOf(data.retryAfterMs).toEqualTypeOf<number>();
    } else {
      expectTypeOf(data.fromGlobalFormatter).toEqualTypeOf<true>();
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
    } else {
      expectTypeOf(data.fromGlobalFormatter).toEqualTypeOf<true>();
    }
  });

  test('a formatter that always returns makes everything before it unreachable', () => {
    const alwaysHandles = rateLimitedProcedure.errors((opts) => ({
      ...opts.shape,
      data: { ...opts.shape.data, kind: 'ALWAYS' as const },
    }));
    const router = t.router({
      proc: alwaysHandles.query((): string => 'never'),
    });

    type Shape = inferProcedureErrorShape<
      Root,
      (typeof router)['_def']['record']['proc']
    >;

    expectTypeOf<Shape['data']['kind']>().toEqualTypeOf<'ALWAYS'>();
    // @ts-expect-error - the global formatter can never run for this procedure
    type _ = Shape['data']['fromGlobalFormatter'];
  });

  test('the router-wide error shape is unaffected', () => {
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
  test('procedure without a formatter falls back to the global one', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(ctx.client.plain.query(), TRPCClientError);

    expect(err.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      fromGlobalFormatter: true,
    });
    expect(err.data).not.toHaveProperty('kind');
  });

  test('a formatter that handles the error replaces the global shape', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(
      ctx.client.rateLimited.query(),
      TRPCClientError,
    );

    expect(err.data).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      kind: 'RATE_LIMIT',
      retryAfterMs: 5_000,
    });
    expect(err.data).not.toHaveProperty('fromGlobalFormatter');
  });

  test('declining hands the error to the global formatter', async () => {
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

  test('the tail of the chain handles the error first', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(ctx.client.billed.mutate(), TRPCClientError);

    expect(err.data).toMatchObject({
      code: 'PAYMENT_REQUIRED',
      kind: 'PAYMENT_REQUIRED',
      amountDue: 42,
    });
  });

  test('declining falls back towards the head of the chain', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(
      ctx.client.billedButRateLimited.mutate(),
      TRPCClientError,
    );

    expect(err.data).toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      kind: 'RATE_LIMIT',
      retryAfterMs: 1_000,
    });
  });

  test('the global formatter runs when the whole chain declines', async () => {
    await using ctx = testServerAndClientResource(appRouter, { clientLink });

    const err = await waitError(
      ctx.client.billedButUnrelatedError.mutate(),
      TRPCClientError,
    );

    expect(err.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      fromGlobalFormatter: true,
    });
    expect(err.data).not.toHaveProperty('kind');
  });
});

test('formatters run from the tail backwards and stop at the first handler', async () => {
  const calls: string[] = [];

  const globalFormatter = vi.fn();
  const local = initTRPC.create({
    errorFormatter(opts) {
      globalFormatter();
      return opts.shape;
    },
  });

  const procedure = local.procedure
    .errors(() => {
      calls.push('first');
      return undefined;
    })
    .errors(() => {
      calls.push('second');
      return undefined;
    })
    .errors((opts) => {
      calls.push('third');
      return {
        ...opts.shape,
        data: { ...opts.shape.data, handledBy: 'third' as const },
      };
    })
    .errors(() => {
      calls.push('fourth');
      return undefined;
    });

  const router = local.router({
    proc: procedure.query((): string => {
      throw new TRPCError({ code: 'BAD_REQUEST' });
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const err = await waitError(ctx.client.proc.query(), TRPCClientError);

  expect(err.data).toMatchObject({ handledBy: 'third' });
  expect(calls).toEqual(['fourth', 'third']);
  expect(globalFormatter).not.toHaveBeenCalled();
});

test('errors thrown from middlewares go through the chain', async () => {
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
    kind: 'FROM_MIDDLEWARE',
  });
});

test('`concat()` runs the concatenated formatters first', async () => {
  const a = t.procedure.errors((opts) => {
    if (opts.error.code === 'BAD_REQUEST') {
      return { ...opts.shape, data: { ...opts.shape.data, from: 'a' as const } };
    }
    return undefined;
  });
  const b = t.procedure.errors((opts) => {
    if (opts.error.code === 'BAD_REQUEST') {
      return { ...opts.shape, data: { ...opts.shape.data, from: 'b' as const } };
    }
    return undefined;
  });

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
  if ('from' in data) {
    data.from satisfies 'a' | 'b';
  }

  await using ctx = testServerAndClientResource(router);

  const err = await waitError(ctx.client.combined.query(), TRPCClientError);

  expect(err.data).toMatchObject({ from: 'b' });
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

    test('errors thrown before the first value go through the chain', async () => {
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
        kind: 'RATE_LIMIT',
        retryAfterMs: 3_000,
      });
    });

    test('errors thrown mid-stream go through the chain', async () => {
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
        kind: 'RATE_LIMIT',
        retryAfterMs: 7_000,
      });
    });
  },
);
