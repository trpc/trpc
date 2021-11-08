/* eslint-disable @typescript-eslint/ban-types */

import * as trpc from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';

export type Context = {};

export const appRouter = trpc.router<Context>().query('hello', {
  async resolve() {
    return {
      text: `hello from server 1`,
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

listen(2031);
