/**
 * This file contains the root router of your tRPC-backend
 */
import { t } from '../trpc';
import { healthRouter } from './health';
import { postRouter } from './post';

export const appRouter = t.mergeRouters(postRouter, healthRouter);

export type AppRouter = typeof appRouter;
