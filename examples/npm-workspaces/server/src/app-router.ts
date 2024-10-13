import { publicProcedure, router } from "./_skel/trpc.js";
import userRouter from './modules/user/router.js';

const appRouter = router({
  user: userRouter,
  examples: {
    iterable: publicProcedure.query(async function* () {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        yield i;
      }
    }),
  },
});

export default appRouter;

// Export router type signature, this is used by the client.
export type AppRouter = typeof appRouter;
