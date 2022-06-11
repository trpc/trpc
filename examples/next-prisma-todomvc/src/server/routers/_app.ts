import superjson from 'superjson';
import { createRouter } from '../createRouter';
import { todoRouter } from './todo';

export const appRouter = createRouter()
  .transformer(superjson)
  .merge('todo.', todoRouter)
  .interop();

export type AppRouter = typeof appRouter;
