/**
 * This file contains the root router of your tRPC-backend
 */
import { createRouter } from '../createRouter';
import { postRouter } from './post';
import { Subscription } from '@trpc/server';
import superjson from 'superjson';
import { clearInterval } from 'timers';

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
  .query('healthz', {
    resolve() {
      return 'yay!';
    },
  })
  .merge('post.', postRouter)
  .subscription('randomNumber', {
    resolve() {
      return new Subscription<number>((emit) => {
        const int = setInterval(() => {
          emit.data(Math.random());
        }, 500);
        return () => {
          clearInterval(int);
        };
      });
    },
  });

export type AppRouter = typeof appRouter;
