import { initTRPC } from '@trpc/server';
import { z } from 'zod';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

class ConflictError extends Error {
  constructor(public readonly conflictsWith: string) {
    super('Conflict');
  }
}

const t = initTRPC.create({
  errorFormatter(opts) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        requestId: 'req_1',
      },
    };
  },
});

const rateLimited = t.procedure.errors((opts) => {
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

/** Same shape as `rateLimited` - the union should collapse it, not repeat it */
const rateLimitedTwice = rateLimited.errors((opts) => {
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

const conflictAware = rateLimited.errors((opts) => {
  if (opts.error.cause instanceof ConflictError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'CONFLICT' as const,
        conflictsWith: opts.error.cause.conflictsWith,
      },
    };
  }
  return undefined;
});

export const ProcedureErrorsRouter = t.router({
  /** Uses the router-wide error shape only */
  plain: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
  /** Can additionally fail with a rate-limit error */
  limited: rateLimited
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
  /** Two chained `.errors()` handlers, each with their own shape */
  chained: conflictAware
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
  /** Chained handlers that declare the *same* shape */
  chainedDuplicate: rateLimitedTwice
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
  /** A handler that never claims an error - stays on the router-wide shape */
  neverClaims: t.procedure
    .errors(() => undefined)
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
  /** A single handler that can return either of two shapes */
  multiShape: t.procedure
    .errors((opts) => {
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
      if (opts.error.cause instanceof ConflictError) {
        return {
          ...opts.shape,
          data: {
            ...opts.shape.data,
            kind: 'CONFLICT' as const,
            conflictsWith: opts.error.cause.conflictsWith,
          },
        };
      }
      return undefined;
    })
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
});

export type ProcedureErrorsRouter = typeof ProcedureErrorsRouter;
