/*
 * Type alias works since it is defined in root tsconfig and thus for client as well
 * While it's not that useful here, it can come in handy when splitting nested routers into multiple
 * files.
 */
import { publicProcedure, router } from '~/trpc.js';
import { z } from 'zod';

// In a bigger app, you might want to use nested routers in different files.
// See https://trpc.io/docs/server/merging-routers#merging-with-child-routers
const appRouter = router({
  greeting: publicProcedure
    // This is the input schema of your procedure
    // 💡 Tip: Try changing this and see type errors on the client straight away
    .input(
      z
        .object({
          name: z.string().nullish(),
        })
        .nullish(),
    )
    .query(({ input }) => {
      // This is what you're returning to your client
      return {
        text: `hello ${input?.name ?? 'world'}`,
        // 💡 Tip: Try adding a new property here and see it propagate to the client straight-away
      };
    }),
});

export default appRouter;

// Export router type signature, this is used by the client.
export type AppRouter = typeof appRouter;
