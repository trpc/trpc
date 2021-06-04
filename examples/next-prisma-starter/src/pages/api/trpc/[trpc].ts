/**
 * This file contains the tRPC http response handler
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { appRouter } from 'routers/appRouter';
import { createContext } from 'routers/utils/createRouter';

export default trpcNext.createNextApiHandler({
  router: appRouter,
  /**
   * @link https://trpc.io/docs/context
   */
  createContext,
  /**
   * Data transformer
   * @link https://trpc.io/docs/data-transformers
   */
  // transformer: superjson,

  /**
   * @link https://trpc.io/docs/error-handling
   */
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
});
