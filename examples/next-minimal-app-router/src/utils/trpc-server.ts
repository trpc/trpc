import { createTRPCNextAppRouter } from '@trpc/next-app-router/server';
import { appRouter } from '~/server/router';
import { createContext } from '~/server/trpc';

export const trpc = createTRPCNextAppRouter({
  router: appRouter,
  createContext: createContext,
});
