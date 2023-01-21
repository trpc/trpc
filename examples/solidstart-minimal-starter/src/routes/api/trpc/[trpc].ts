import { createSolidApiHandler } from '@trpc/server/adapters/solid';
import { appRouter, createContext } from '~/server/trpc';

export const { GET, POST } = createSolidApiHandler({
  router: appRouter,
  createContext,
});
