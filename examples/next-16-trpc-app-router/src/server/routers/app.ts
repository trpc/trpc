import { publicProcedure, router } from '@/src/server/trpc';
import { z } from 'zod';

export const appRouter = router({
  healthcheck: publicProcedure.query(() => 'OK ✅'),

  greeting: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(({ input }) => {
      return `Hello ${input.name}!`;
    }),
});

export type AppRouter = typeof appRouter;
