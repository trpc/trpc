/**
 * This file contains the root router of your tRPC-backend
 */
import { reactHookFormRouter } from 'feature/react-hook-form/router';
import { ssgRouter } from 'feature/ssg/router';
import superjson from 'superjson';
import { createRouter } from '../createRouter';
import { postRouter } from './post';
import { sourceRouter } from './source';

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
export const appRouter = createRouter()
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
  .merge('post.', postRouter)
  .merge('source.', sourceRouter)
  // features:
  .merge(reactHookFormRouter)
  .merge(ssgRouter);

export type AppRouter = typeof appRouter;
