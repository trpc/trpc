import * as trpcNext from '@trpc/server/adapters/next';
import superjson from 'superjson';
import { todoRouter } from '../../../server/routers/todo';
import { createContext } from '../../../server/context';
import { createRouter } from '../../../server/createRouter';
import { prisma } from '../../../utils/prisma';

const router = createRouter().transformer(superjson).merge('todo.', todoRouter);

export const appRouter = router;
export type AppRouter = typeof router;

export default trpcNext.createNextApiHandler({
  router,
  createContext,
  teardown: () => prisma.$disconnect(),
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
});
