import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

const t = initTRPC.create({ transformer: superjson });

export const SuperjsonRouter = t.router({
  getEvent: t.procedure
    .input(z.object({ id: z.string(), at: z.date() }))
    .output(z.object({ id: z.string(), at: z.date() }))
    .query(({ input }) => input),

  createEvent: t.procedure
    .input(z.object({ name: z.string(), at: z.date() }))
    .output(z.object({ name: z.string(), at: z.date() }))
    .mutation(({ input }) => input),
});

export type SuperjsonRouter = typeof SuperjsonRouter;
