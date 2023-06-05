/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { publicProcedure, router } from '~/server/trpc';
import { z } from 'zod';

const appRouter = router({
  greeting: publicProcedure
    // This is the input schema of your procedure
    // 💡 Tip: Try changing this and see type errors on the client straight away
    .input(
      z.object({
        name: z.string().optional(),
      }),
    )
    .mutation(hundredHellos),
  // .query(({ input }) => {
  //   return {
  //     text: `hello ${input?.name ?? 'world'}`,
  //   };
  // })
  greetingFlat: publicProcedure
    // This is the input schema of your procedure
    // 💡 Tip: Try changing this and see type errors on the client straight away
    .input(
      z.object({
        name: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      return {
        text: `hello ${input?.name ?? 'world'}`,
      };
    }),
  ping: publicProcedure
    .query(() => 'pong'),
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});

async function* hundredHellos({ input }: { input: { name?: string } }) {
  for (let i = 0; i < 5; i++) {
    yield {
      text: `hello ${input?.name ?? 'world'} ${i}`,
    };
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}