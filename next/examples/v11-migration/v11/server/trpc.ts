import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Context } from './context.ts';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter(opts) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        issues:
          opts.error.cause instanceof ZodError
            ? opts.error.cause.issues.map((issue) => issue.message)
            : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const authedProcedure = t.procedure.use((opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Send an authorization header',
    });
  }
  return opts.next({ ctx: { user: opts.ctx.user } });
});
