/**
 * This file contains the root router of your tRPC-backend
 */
import { router } from '../trpc';
import { healthRouter } from './health';
import { postRouter } from './post';

export const appRouter = router({
  post: postRouter,
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
