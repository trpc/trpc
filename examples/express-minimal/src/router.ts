import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

const helloRouter = router({
  greeting: publicProcedure
    .input(z.object({ name: z.string() }).nullish())
    .query(({ input }) => {
      return `Hello ${input?.name ?? 'World'}`;
    }),
});

export const appRouter = router({
  hello: helloRouter,
});

export type AppRouter = typeof appRouter;
