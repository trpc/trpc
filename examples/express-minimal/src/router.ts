import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const helloRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }).nullish())
    .query(({ input }) => {
      return `Hello ${input?.name ?? 'World'}`;
    }),
});

export const appRouter = t.router({
  hello: helloRouter,
});

export type AppRouter = typeof appRouter;
