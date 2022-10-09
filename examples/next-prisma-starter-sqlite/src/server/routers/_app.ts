/**
 * This file contains the root router of your tRPC-backend
 */
import { createRouter } from '../trpc';
import { healthRouter } from './health';
import { postRouter } from './post';

export const appRouter = createRouter({
  post: postRouter,
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
