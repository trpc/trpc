/* eslint-disable @typescript-eslint/ban-types */

import * as trpc from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';

export const appRouter = trpc.router().query('hello', {
  resolve: () => {
    return {
      text: `hello from server 2`,
    };
  },
});

export type Server1Router = typeof appRouter;

// http server
const { listen } = createHTTPServer({
  router: appRouter,
  createContext() {
    return {};
  },
});

listen(2032);
