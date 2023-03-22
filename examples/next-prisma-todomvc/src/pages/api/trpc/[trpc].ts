import { createNextApiHandler } from '@trpc/server/adapters/next';
import { createTRPCContext } from '../../../server/context';
import { appRouter } from '../../../server/routers/_app';

export default createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
});
