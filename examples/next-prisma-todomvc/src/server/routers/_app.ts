import { t } from '../trpc';
import { todoRouter } from './todo';

export const appRouter = t.router({
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
