import { createSolidApiHandler } from '@trpc/server/adapters/solid';
import { createContext } from '~/server/trpc/context';
import { appRouter } from '~/server/trpc/router/_app';

const handler = createSolidApiHandler({
  router: appRouter,
  createContext,
});

export const GET = handler;
export const POST = handler;
