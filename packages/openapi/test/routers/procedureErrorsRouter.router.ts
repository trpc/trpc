import { initTRPC } from '@trpc/server';
import { z } from 'zod';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
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

export const ProcedureErrorsRouter = t.router({
  /** Uses the router-wide error shape only */
  plain: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
  /** Can additionally fail with a rate-limit error */
  limited: rateLimited
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
});

export type ProcedureErrorsRouter = typeof ProcedureErrorsRouter;
