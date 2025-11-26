import { tracked } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../init';

let subscriptionIdx = 0;

export const appRouter = createTRPCRouter({
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

export type AppRouter = typeof appRouter;
