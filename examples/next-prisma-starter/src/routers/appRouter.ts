import { postsRouter } from './posts';
import { createRouter } from './utils/createRouter';

export const appRouter = createRouter()
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ defaultShape, error }) => { })
  .merge('posts.', postsRouter);

export type AppRouter = typeof appRouter;
