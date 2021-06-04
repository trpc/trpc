/**
 * This file contains the tRPC http response handler
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { postsRouter } from 'routers/posts';
import { createContext, createRouter } from 'routers/utils/createRouter';

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
export const appRouter = createRouter()
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ defaultShape, error }) => { })
  .merge('posts.', postsRouter);

export type AppRouter = typeof appRouter;

export default trpcNext.createNextApiHandler({
  router: appRouter,
  /**
   * @link https://trpc.io/docs/context
   */
  createContext,
  /**
   * Data transformer
   * @link https://trpc.io/docs/data-transformers
   */
  // transformer: superjson,

  /**
   * @link https://trpc.io/docs/error-handling
   */
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
});
