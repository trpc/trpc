import { PrismaClient } from '@prisma/client';
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/dist/adapters/next';
import superjson from 'superjson';
import { todoRouter } from './todoRouter';
const prisma = new PrismaClient();

// ctx
export const createContext = async (
  opts?: trpcNext.CreateNextContextOptions,
) => {
  return {
    task: prisma.task,
  };
};
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

export function createRouter() {
  return trpc.router<Context>();
}
const router = createRouter().merge('todos.', todoRouter);

export const appRouter = router;
export type AppRouter = typeof router;

export default trpcNext.createNextApiHandler({
  router,
  createContext,
  teardown: () => prisma.$disconnect(),
  transformer: superjson,
});
