import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  greeting: t.procedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return `hello ${input.text}`;
    }),
});

export type AppRouter = typeof appRouter;
