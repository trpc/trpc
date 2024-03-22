import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../init';
import { postRouter } from './post';

/**
 * This is the primary router for your server.
 *
 * All routers added in /routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,

  wait: publicProcedure
    .input(z.object({ ms: z.number().min(1).max(10e3) }))
    .query(async ({ input }) => {
      await new Promise((resolve) => setTimeout(resolve, input.ms));

      return `Waited for ${input.ms}ms`;
    }),
});
export type AppRouter = typeof appRouter;
