/**
 * This file contains the root router of your tRPC-backend
 */
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  greeting: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(({ input }) => {
      return {
        text: `hello ${input.name}`,
        date: new Date('2022Z'),
      };
    }),
});

export type AppRouter = typeof appRouter;
