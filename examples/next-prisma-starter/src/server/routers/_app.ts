/**
 * This file contains the root router of your tRPC-backend
 */
import { createCallerFactory, publicProcedure, router } from '../trpc';
import { feedRouter } from './feed';
import { postRouter } from './post';

export const appRouter = router({
  feed: feedRouter,
  healthcheck: publicProcedure.query(() => 'yay!'),

  post: postRouter,
});

export const createCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;

export * from '../views';
