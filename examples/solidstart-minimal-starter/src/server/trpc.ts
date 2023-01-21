import type { inferAsyncReturnType } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { type CreateSolidContextOptions } from '@trpc/server/adapters/solid';
import { z } from 'zod';

export const createContext = async (opts: CreateSolidContextOptions) => {
  return opts;
};

export type IContext = inferAsyncReturnType<typeof createContext>;

export const t = initTRPC.context<IContext>().create();

export const router = t.router;
export const procedure = t.procedure;

export const appRouter = router({
  hello: procedure.input(z.object({ name: z.string() })).query(({ input }) => {
    return `Hello ${input.name}`;
  }),
  random: procedure
    .input(z.object({ num: z.number() }))
    .mutation(({ input }) => {
      return Math.floor(Math.random() * 100) / input.num;
    }),
});

export type AppRouter = typeof appRouter;
