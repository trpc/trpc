/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { tracked } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { publicProcedure, router } from '~/server/trpc';
import { z } from 'zod';

let subscriptionIdx = 0;

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
  loopData: publicProcedure
    .input(
      z
        .object({
          lastEventId: z.coerce.number().finite().nonnegative(),
        })
        .optional(),
    )
    .subscription(async function* (opts) {
      const id = ++subscriptionIdx;

      let count = opts.input?.lastEventId ?? 0;
      console.log(
        `[${id}] 🚀 Starting subscription id: ${id} - lastEventId: ${count}`,
      );
      try {
        while (!opts.signal?.aborted) {
          ++count;
          console.log(`[${id}] 🔄 loop ${count}`);

          yield tracked(
            `${count}`,
            `[${id}] 📬 new data (count: ${count}, sub id: ${id})`,
          );
          await new Promise((r) => setTimeout(r, 1000));
        }
        console.log(`[${id}] ✅ done`);
      } catch (error) {
        console.error(`[${id}] ❌ error`, error);
      }
    }),
  // 💡 Tip: Try adding a new procedure here and see if you can use it in the client!
  // getUser: publicProcedure.query(() => {
  //   return { id: '1', name: 'bob' };
  // }),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
