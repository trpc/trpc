import { createSolidApiHandler } from '@trpc/server/adapters/solid';
import { createContext } from '~/server/trpc/context';
import { appRouter } from '~/server/trpc/router/_app';

export const { GET, POST } = createSolidApiHandler({
  router: appRouter,
  createContext,
});
