/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';
import { publicProcedure, router, unstable_RouterBase } from '~/server/trpc';

class PostRouter extends unstable_RouterBase {
  public allPosts = publicProcedure.query(() => {
    return 'hello';
  });
}
class MyAppRouter extends unstable_RouterBase {
  public post;
  constructor() {
    super();
    this.post = new PostRouter().toRouter();
  }
  public greeting = publicProcedure.query(() => {
    return 'hello';
  });
}

const appRouter = new MyAppRouter().toRouter();

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
