/* eslint-disable @typescript-eslint/ban-types */

import * as trpc from '@trpc/server';
import * as z from 'zod';
type Context = {};

export const appRouter = trpc
  // create router
  .router<Context>()
  // add query `hello`
  .query('hello', {
    input: z.object({
      text: z.string(),
    }),
    resolve: ({ input }) => {
      return {
        text: `hello ${input.text}`,
      };
    },
  });

export type AppRouter = typeof appRouter;

trpc
  .createHttpServer({
    router: appRouter,
    createContext() {
      return {};
    },
  })
  .listen(2022);
