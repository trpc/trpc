/**
 * This file contains the root router of your tRPC-backend
 */
import { createRouter } from '../createRouter';
import { t } from '../trpc';
import { postRouter } from './post';
import { observable } from '@trpc/server/observable';

export const rootRouter = t.router({
  queries: {
    healthz: t.procedure.resolve(() => 'yay!'),
  },
  subscriptions: {
    randomnumber: t.procedure.resolve(() => {
      return observable<number>((emit) => {
        const int = setInterval(() => {
          emit.next(Math.random());
        }, 500);
        return () => {
          clearInterval(int);
        };
      });
    }),
  },
});

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
export const appRouterOld = createRouter()
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ shape, error }) => { })
  .merge('post.', postRouter)
  .interop();

export const appRouter = t.mergeRouters(rootRouter, appRouterOld);

export type AppRouter = typeof appRouter;
