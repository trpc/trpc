import type { inferAsyncReturnType } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { type CreateSolidContextOptions } from '@trpc/server/adapters/solid';
import { z } from 'zod';

export const createContext = async (opts: CreateSolidContextOptions) => {
  return opts;
};

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  greeting: publicProcedure
    // This is the input schema of your procedure
    // 💡 Tip: Try changing this and see type errors on the client straight away
    .input(
      z.object({
        name: z.string().nullish(),
      }),
    )
    .query(({ input }) => {
      // This is what you're returning to your client
      return {
        text: `hello ${input?.name ?? 'world'}`,
        // 💡 Tip: Try adding a new property here and see it propagate to the client straight-away
      };
    }),
  random: publicProcedure
    .input(z.object({ num: z.number() }))
    .mutation(({ input }) => {
      return Math.floor(Math.random() * 100) / input.num;
    }),
});

export type AppRouter = typeof appRouter;
