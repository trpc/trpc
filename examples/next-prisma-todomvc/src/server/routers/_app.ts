import { createRouter } from '../trpc';
import { todoRouter } from './todo';

export const appRouter = createRouter({
  todo: todoRouter,
});

export type AppRouter = typeof appRouter;
