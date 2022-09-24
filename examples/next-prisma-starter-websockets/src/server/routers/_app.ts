/**
 * This file contains the root router of your tRPC-backend
 */
import { t } from '../trpc';
import { postRouter } from './post';
import { observable } from '@trpc/server/observable';
import { clearInterval } from 'timers';

export const appRouter = t.router({
  healthcheck: t.procedure.query(() => {
    return 'yay';
  }),

  post: postRouter,

  randomNumber: t.procedure.subscription(() => {
    return observable<number>((emit) => {
      const int = setInterval(() => {
        emit.next(Math.random());
      }, 500);
      return () => {
        clearInterval(int);
      };
    });
  }),
});

export type AppRouter = typeof appRouter;
