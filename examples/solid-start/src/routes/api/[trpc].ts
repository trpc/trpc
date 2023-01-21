import {
  type CreateSolidContextOptions,
  createSolidApiHandler,
} from '@trpc/server/adapters/solid';
import { z } from 'zod';
import { publicProcedure, router } from '~/server/trpc';

const appRouter = router({
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
  // 💡 Tip: Try adding a new procedure here and see if you can use it in the client!
  // getUser: publicProcedure.query(() => {
  //   return { id: '1', name: 'bob' };
  // }),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

export const createContext = async (opts: CreateSolidContextOptions) => {
  return {
    req: opts.event.request,
    resHeaders: opts.resHeaders,
  };
};
export const { GET, POST } = createSolidApiHandler({
  router: appRouter,
  createContext,
});
