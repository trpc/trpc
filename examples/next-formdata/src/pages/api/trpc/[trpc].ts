/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { roomRouter } from '~/server/routers/room';
import { createContext, router } from '~/server/trpc';
import type { NextApiRequest, NextApiResponse } from 'next';

const appRouter = router({
  room: roomRouter,
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

const handler = trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
});
// export API handler
export default async (req: NextApiRequest, res: NextApiResponse) => {
  await handler(req, res);
};

export const config = {
  api: {
    bodyParser: false,
    responseLimit: '100mb',
  },
};
