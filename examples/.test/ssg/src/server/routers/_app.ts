import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  greeting: publicProcedure
    .input(
      z.object({
        name: z.string().nullish(),
      }),
    )
    .query(({ input }) => {
      return {
        text: `hello ${input?.name ?? 'world'}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
