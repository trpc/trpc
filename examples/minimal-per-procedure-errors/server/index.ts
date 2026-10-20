/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 *
 * This example is about `.errors()` - per-procedure error formatters. A procedure
 * declares the error shapes it can produce, and the client gets them as a
 * discriminated union it has to narrow before use.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { z } from 'zod';

/**
 * Plain domain errors, thrown by whichever layer notices the problem. They know
 * nothing about tRPC - the `.errors()` handlers below are what turn them into
 * something the client can read.
 */
class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

class PaymentRequiredError extends Error {
  /** @param amountDue in cents */
  constructor(public readonly amountDue: number) {
    super('Payment required');
  }
}

class MaintenanceError extends Error {
  constructor(public readonly until: string) {
    super('Down for maintenance');
  }
}

const t = initTRPC.create({
  /**
   * The router-wide fallback. Every error that no `.errors()` handler claims
   * ends up here, so this shape is always part of a procedure's error union.
   */
  errorFormatter(opts) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        handledBy: 'global-errorFormatter' as const,
      },
    };
  },
});

const router = t.router;
const publicProcedure = t.procedure;

/**
 * `.errors()` attaches a formatter to this procedure builder.
 *
 * Return a shape to claim the error, or `undefined` to decline it - a declined
 * error keeps bubbling towards the head of the chain and finally reaches the
 * global `errorFormatter` above. That's why the client sees a *union*: this
 * procedure can answer with either the `RATE_LIMIT` shape or the global one.
 *
 * 💡 Tip: comment out the `retryAfterMs` line and watch the client stop
 *    compiling - the error shape is inferred, not declared twice.
 */
const rateLimitedProcedure = publicProcedure.errors((opts) => {
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

/**
 * Chaining `.errors()` widens the union rather than replacing it, so anything
 * built on this can fail with `PAYMENT_REQUIRED`, `RATE_LIMIT`, *or* the global
 * shape. Handlers run from the tail backwards and the first one to return a
 * shape wins.
 */
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

const appRouter = router({
  /**
   * A procedure with no `.errors()` of its own. Its errors only ever get the
   * global shape - `kind` isn't in its type at all.
   *
   * 💡 Tip: try reading `error.data.kind` off this one on the client.
   */
  greeting: publicProcedure
    .input(z.object({ name: z.string().nullish() }).nullish())
    .query(({ input }) => {
      return { text: `hello ${input?.name ?? 'world'}` };
    }),

  /**
   * Everything the demo throws at it lands on one procedure, so the client has
   * to narrow the full union: `RATE_LIMIT | PAYMENT_REQUIRED | global`.
   */
  checkout: billedProcedure
    .input(
      z.object({
        outcome: z.enum([
          'ok',
          'rate-limit',
          'payment-required',
          'unrelated-failure',
        ]),
      }),
    )
    .mutation(({ input }) => {
      switch (input.outcome) {
        case 'rate-limit':
          // claimed by `rateLimitedProcedure`'s handler
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            cause: new RateLimitError(5_000),
          });
        case 'payment-required':
          // claimed by `billedProcedure`'s handler
          throw new TRPCError({
            code: 'PAYMENT_REQUIRED',
            cause: new PaymentRequiredError(4_200),
          });
        case 'unrelated-failure':
          // both handlers decline, so the global `errorFormatter` formats it
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'The card processor is having a bad day',
          });
        case 'ok':
          return { orderId: 'order_1337' };
      }
    }),

  /**
   * Ordering matters: a handler only sees errors thrown *after* it in the
   * chain. The `.errors()` call comes first here, so it still formats what the
   * middleware below throws.
   *
   * 💡 Tip: move `.errors()` after `.use()` and the error falls through to the
   *    global formatter instead - `kind` disappears from the client's type.
   */
  maintenance: publicProcedure
    .errors((opts) => {
      if (opts.error.cause instanceof MaintenanceError) {
        return {
          ...opts.shape,
          data: {
            ...opts.shape.data,
            kind: 'MAINTENANCE' as const,
            until: opts.error.cause.until,
          },
        };
      }
      return undefined;
    })
    .use(() => {
      throw new TRPCError({
        code: 'SERVICE_UNAVAILABLE',
        cause: new MaintenanceError('2026-01-01T00:00:00.000Z'),
      });
    })
    .query(() => 'unreachable'),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// create server
createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext() {
    return {};
  },
}).listen(2023);
