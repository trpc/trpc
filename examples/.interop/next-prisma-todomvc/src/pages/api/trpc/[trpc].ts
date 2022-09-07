import { PrismaClient } from '@prisma/client';
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import superjson from 'superjson';
import { todoRouter } from '../../../routers/todo';

const prisma = new PrismaClient();

// create context based of incoming request
// set as optional here so it can also be re-used for `getStaticProps()`
export const createContext = async (
  opts?: trpcNext.CreateNextContextOptions,
) => {
  return {
    req: opts?.req,
    prisma,
    task: prisma.task,
  };
};
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

export function createRouter() {
  return trpc.router<Context>();
}
const router = createRouter()
  .transformer(superjson)
  .merge('todo.', todoRouter)
  .interop();

export const appRouter = router;
export type AppRouter = typeof router;

export default trpcNext.createNextApiHandler({
  router,
  createContext,
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
});
