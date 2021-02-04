/* eslint-disable @typescript-eslint/ban-types */

import * as trpc from '@trpc/server';
import * as z from 'zod';

type Context = {};

export const appRouter = trpc.router<Context>().query('hello', {
  input: z.object({
    name: z.string(),
  }),
  resolve: ({ input }) => {
    return {
      text: `hello ${input.name}`,
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
