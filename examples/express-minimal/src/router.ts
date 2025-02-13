import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

export const appRouter = router({
  hello: {
    greeting: publicProcedure
      .input(z.object({ name: z.string() }).nullish())
      .query(({ input }) => {
        return `Hello ${input?.name ?? 'World'}`;
      }),
  },
});

export type AppRouter = typeof appRouter;
