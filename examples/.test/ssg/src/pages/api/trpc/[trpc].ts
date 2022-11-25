/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '~/server/routers/_app';

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
