/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';
import { publicProcedure, unstable_toRouter } from '~/server/trpc';

class PostService {
  public allPosts = publicProcedure.query(() => {
    return [
      {
        id: 1,
        title: 'hello world',
      },
    ];
  });
}
class RootService {
  public post;
  constructor() {
    this.post = unstable_toRouter(new PostService());
  }

  public commonMethod() {
    return 'i am a shared method but not exposed to the client as a procedure';
  }

  public greeting = publicProcedure
    .input(
      z.object({
        name: z.string().nullish(),
      }),
    )
    .query(({ input }) => {
      return {
        text: `hello ${input?.name ?? 'world'}`,
        // Try calling class method
        commonMethodResult: this.commonMethod(),
      };
    });
}

const appRouter = unstable_toRouter(new RootService());

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
