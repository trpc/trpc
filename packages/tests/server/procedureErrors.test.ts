import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { inferProcedureErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { lazy } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

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

  test('the router shape stays in the union even for an always-returning handler', () => {
    const alwaysHandles = t.procedure.errors((opts) => ({
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

    // errors raised before the procedure runs - routing, a malformed request
    // body, context creation - never reach the chain, so the router-wide shape
    // is always possible
    const data = {} as Shape['data'];
    if ('kind' in data) {
      expectTypeOf(data.kind).toEqualTypeOf<'ALWAYS'>();
    } else {
      expectTypeOf(data.fromGlobalFormatter).toEqualTypeOf<true>();
    }
  });

  test('a handler that always throws falls back instead of collapsing to never', () => {
    const throws = t.procedure.errors((): never => {
      throw new Error('boom');
    });
    const router = t.router({ proc: throws.query((): string => 'never') });

    type Shape = inferProcedureErrorShape<
      Root,
      (typeof router)['_def']['record']['proc']
    >;

    expectTypeOf<Shape['data']['fromGlobalFormatter']>().toEqualTypeOf<true>();
    const data = {} as Shape['data'];
    // @ts-expect-error - `never` would silently allow any property access
    data.anythingAtAll;
  });

  test('`concat()` unions both sides of the chain', () => {
    const a = t.procedure.errors((opts) => {
      if (opts.error.code === 'BAD_REQUEST') {
        return { ...opts.shape, data: { ...opts.shape.data, k: 'A' as const } };
      }
      return undefined;
    });
    const b = t.procedure.errors((opts) => {
      if (opts.error.code === 'CONFLICT') {
        return { ...opts.shape, data: { ...opts.shape.data, k: 'B' as const } };
      }
      return undefined;
    });

    const router = t.router({
      combined: a.concat(b).query((): string => 'never'),
    });

    const data = {} as inferProcedureErrorShape<
      Root,
      (typeof router)['_def']['record']['combined']
    >['data'];
    if ('k' in data) {
      data.k satisfies 'A' | 'B';
    } else {
      expectTypeOf(data.fromGlobalFormatter).toEqualTypeOf<true>();
    }
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

test('handlers only catch errors thrown further down the chain', async () => {
  const caught = t.procedure
    .errors((opts) => ({
      ...opts.shape,
      data: { ...opts.shape.data, kind: 'CAUGHT' as const },
    }))
    .use((opts) => {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
      return opts.next();
    });

  // the middleware throws before the handler is ever reached
  const missed = t.procedure
    .use((opts) => {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
      return opts.next();
    })
    .errors((opts) => ({
      ...opts.shape,
      data: { ...opts.shape.data, kind: 'MISSED' as const },
    }));

  const router = t.router({
    caught: caught.query(() => 'never'),
    missed: missed.query(() => 'never'),
  });

  await using ctx = testServerAndClientResource(router);

  const caughtErr = await waitError(ctx.client.caught.query(), TRPCClientError);
  expect(caughtErr.data).toMatchObject({ kind: 'CAUGHT' });

  const missedErr = await waitError(ctx.client.missed.query(), TRPCClientError);
  expect(missedErr.data).toMatchObject({ fromGlobalFormatter: true });
  expect(missedErr.data).not.toHaveProperty('kind');
});

test('handlers catch errors from input parsing', async () => {
  const procedure = t.procedure
    .errors((opts) => {
      if (opts.error.code === 'BAD_REQUEST') {
        return {
          ...opts.shape,
          data: { ...opts.shape.data, kind: 'BAD_INPUT' as const },
        };
      }
      return undefined;
    })
    .input(z.object({ name: z.string() }));

  const router = t.router({
    greet: procedure.query(({ input }) => input.name),
  });

  await using ctx = testServerAndClientResource(router);

  const err = await waitError(
    // @ts-expect-error - deliberately wrong input
    ctx.client.greet.query({ name: 42 }),
    TRPCClientError,
  );

  expect(err.data).toMatchObject({ kind: 'BAD_INPUT' });
});

test('`concat()` runs the concatenated formatters first', async () => {
  const a = t.procedure.errors((opts) => {
    if (opts.error.code === 'BAD_REQUEST') {
      return {
        ...opts.shape,
        data: { ...opts.shape.data, from: 'a' as const },
      };
    }
    return undefined;
  });
  const b = t.procedure.errors((opts) => {
    if (opts.error.code === 'BAD_REQUEST') {
      return {
        ...opts.shape,
        data: { ...opts.shape.data, from: 'b' as const },
      };
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

test.each(['httpLink', 'wsLink'] as const)(
  'handlers inside a lazy router still run over %s',
  async (clientLink) => {
    const router = t.router({
      sub: lazy(async () =>
        t.router({
          boom: rateLimitedProcedure.query((): string => {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              cause: new RateLimitError(9_000),
            });
          }),
        }),
      ),
    });

    await using ctx = testServerAndClientResource(router, { clientLink });

    const err = await waitError(ctx.client.sub.boom.query(), TRPCClientError);

    expect(err.data).toMatchObject({
      kind: 'RATE_LIMIT',
      retryAfterMs: 9_000,
    });
  },
);

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

test('the handler sees the context added by earlier middlewares', async () => {
  const local = initTRPC.create();

  const procedure = local.procedure
    .use((opts) => opts.next({ ctx: { userId: 'user_1' } }))
    .errors((opts) => {
      expectTypeOf(opts.ctx).toMatchTypeOf<{ userId: string }>();
      return {
        ...opts.shape,
        data: { ...opts.shape.data, userId: opts.ctx.userId },
      };
    })
    .use((opts) => {
      throw new TRPCError({ code: 'FORBIDDEN' });
      return opts.next();
    });

  const router = local.router({ proc: procedure.query(() => 'never') });

  await using ctx = testServerAndClientResource(router);

  const err = await waitError(ctx.client.proc.query(), TRPCClientError);

  expect(err.data).toMatchObject({ userId: 'user_1' });
});

test('the handler receives the default shape, including the dev stack', async () => {
  const local = initTRPC.create({ isDev: true });

  const seen: unknown[] = [];
  const router = local.router({
    proc: local.procedure
      .errors((opts) => {
        seen.push(opts.shape);
        return undefined;
      })
      .query((): string => {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'nope' });
      }),
  });

  await using ctx = testServerAndClientResource(router);
  await waitError(ctx.client.proc.query(), TRPCClientError);

  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({
    message: 'nope',
    data: { code: 'BAD_REQUEST', httpStatus: 400, path: 'proc' },
  });
  expect((seen[0] as { data: { stack?: string } }).data.stack).toEqual(
    expect.any(String),
  );
});
