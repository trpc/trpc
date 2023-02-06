/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';
import { publicProcedure, unstable_toRouter } from '~/server/trpc';

class PostRouter {
  public allPosts = publicProcedure.query(() => {
    return 'hello';
  });
}
class MyAppRouter {
  public post;
  constructor() {
    this.post = unstable_toRouter(new PostRouter());
  }

  private commonMethod() {
    return 'hello';
  }

  public greeting = publicProcedure
    .input(
      z.object({
        name: z.string().nullish(),
      }),
    )
    .query(() => {
      return 'hello';
    });
}

const appRouter = unstable_toRouter(new MyAppRouter());

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
