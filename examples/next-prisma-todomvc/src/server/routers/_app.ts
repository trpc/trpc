import { createRouter } from '../createRouter';
import superjson from 'superjson';
import { todoRouter } from './todo';

export const appRouter = createRouter()
  .transformer(superjson)
  .merge('todo.', todoRouter);

export type AppRouter = typeof appRouter;
