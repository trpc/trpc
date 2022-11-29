import { createNextApiHandler } from '@trpc/server/adapters/next';
import { createContext } from '~/trpc/server/context';
import { appRouter } from '~/trpc/server/routers/_app';

export default createNextApiHandler({
  router: appRouter,
  createContext,
});
