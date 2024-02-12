import type { inferProcedureBuilderContext } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import type { Context } from './context';

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const somethingProcedure = t.procedure.use(({ ctx, next }) => {
  return next({
    ctx: {
      ...ctx,
      something:
        'Hi, I am something that came from the somethingProcedure ctx!' as const,
    },
  });
});

export type SomethingProcedureCtx = inferProcedureBuilderContext<
  typeof somethingProcedure
>;
