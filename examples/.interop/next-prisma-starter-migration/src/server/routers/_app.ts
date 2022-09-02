/**
 * This file contains the root router of your tRPC-backend
 */
import { createRouter } from '../createRouter';
import { t } from '../trpc';
import { postRouter } from './post';
import superjson from 'superjson';

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
const legacyRouter = createRouter()
  /**
   * Add data transformers
   * @link https://trpc.io/docs/data-transformers
   */
  .transformer(superjson)
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ shape, error }) => { })
  /**
   * Add a health check endpoint to be called with `/api/trpc/healthz`
   */
  .query('healthz', {
    async resolve() {
      return 'yay!';
    },
  })
  /**
   * Merge `postRouter` under `post.`
   */
  .merge('post.', postRouter)
  .interop();

const newRouter = t.router({
  newQuery: t.procedure.query(() => 'Hello v10'),
});

export const appRouter = t.mergeRouters(legacyRouter, newRouter);

export type AppRouter = typeof appRouter;
