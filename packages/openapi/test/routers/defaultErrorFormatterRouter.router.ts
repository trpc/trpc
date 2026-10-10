import { initTRPC } from '@trpc/server';
import { z } from 'zod';

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

/** No `errorFormatter`, so procedures start from the default error shape */
const t = initTRPC.create();

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

/** Rewrites the message but keeps the router-wide shape's keys */
const sanitized = t.procedure.errors((opts) => {
  if (opts.error.code === 'INTERNAL_SERVER_ERROR') {
    return { ...opts.shape, message: 'Internal error' };
  }
  return undefined;
});

export const DefaultErrorFormatterRouter = t.router({
  /** Uses the router-wide error shape only */
  plain: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
  /** Can additionally fail with a rate-limit error */
  limited: rateLimited
    .input(z.object({ message: z.string() }))
    .mutation(() => ({ ok: true })),
  /** Its handler's shape is the router-wide one with a different message */
  sanitized: sanitized
    .input(z.object({ id: z.string() }))
    .mutation(() => ({ ok: true })),
});

export type DefaultErrorFormatterRouter = typeof DefaultErrorFormatterRouter;
