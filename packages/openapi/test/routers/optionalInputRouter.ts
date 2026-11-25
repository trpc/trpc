import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const OptionalInputRouter = t.router({
  optional: t.procedure
    .input(z.object({ name: z.string() }).optional())
    .mutation(({ input }) => input?.name ?? 'anonymous'),

  nullish: t.procedure
    .input(z.object({ name: z.string() }).nullish())
    .mutation(({ input }) => input?.name ?? 'anonymous'),

  required: t.procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => input.name),

  nullable: t.procedure
    .input(z.object({ name: z.string() }).nullable())
    .mutation(({ input }) => input?.name ?? 'anonymous'),
});

export type OptionalInputRouter = typeof OptionalInputRouter;
