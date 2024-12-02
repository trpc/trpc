/**
 * This file contains the root router of your tRPC-backend
 */
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

function getRandomArbitrary(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export const appRouter = router({
  greeting: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(async (opts) => {
      await new Promise((resolve) => setTimeout(resolve, getRandomArbitrary(100, 1000)));

      return {
        text: `hello ${opts.input.name}`,
        date: new Date().toLocaleTimeString(),
      };
    })
});

export type AppRouter = typeof appRouter;
