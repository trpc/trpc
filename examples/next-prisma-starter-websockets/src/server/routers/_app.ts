/**
 * This file contains the root router of your tRPC-backend
 */
import { t } from '../trpc';
import { postRouter } from './post';
import { observable } from '@trpc/server/observable';

export const rootRouter = t.router({
  queries: {
    healthz: t.procedure.resolve(() => 'yay!'),
  },
  subscriptions: {
    randomNumber: t.procedure.resolve(() => {
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

export const appRouter = t.mergeRouters(rootRouter, postRouter);

export type AppRouter = typeof appRouter;
