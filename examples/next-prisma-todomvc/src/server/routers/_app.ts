import { t } from '../trpc';
import { todoRouter } from './todo';

export const appRouter = t.mergeRouters(todoRouter);

export type AppRouter = typeof appRouter;
