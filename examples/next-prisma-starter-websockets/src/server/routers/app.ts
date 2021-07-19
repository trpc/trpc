/**
 * This file contains the tRPC http response handler and context creation for Next.js
 */
import { Subscription } from '@trpc/server';
import { clearInterval } from 'timers';
import { createRouter } from '../trpc';
import { postsRouter } from './posts';
import superjson from 'superjson';
// Infers the context returned from `createContext`

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
  .merge('posts.', postsRouter)
  .subscription('randomNumber', {
    resolve() {
      return new Subscription<number>((emit) => {
        const generateNumberAndEmit = () => {
          emit.data(Math.random());
        };
        const int = setInterval(generateNumberAndEmit, 500);
        generateNumberAndEmit();
        return () => {
          clearInterval(int);
        };
      });
    },
  });

export type AppRouter = typeof appRouter;
