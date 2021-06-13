/* eslint-disable @typescript-eslint/ban-types */

import * as trpc from '@trpc/server';
import { wssHandler } from '@trpc/server/ws';
import { z } from 'zod';
import ws from 'ws';

type Context = {};

export const appRouter = trpc
  .router<Context>()
  .query('hello', {
    input: z
      .object({
        name: z.string(),
      })
      .optional(),
    resolve: ({ input }) => {
      return {
        text: `hello ${input?.name ?? 'world'}`,
      };
    },
  })
  .mutation('createPost', {
    input: z.object({
      title: z.string(),
      text: z.string(),
    }),
    resolve({ input }) {
      // imagine db call here
      return {
        id: `${Math.random()}`,
        ...input,
      };
    },
  });

export type AppRouter = typeof appRouter;

// http server
trpc
  .createHttpServer({
    router: appRouter,
    createContext() {
      return {};
    },
  })
  .listen(2022);

// ws server
const wss = new ws.Server({ port: 2023 });
wssHandler<AppRouter>({
  wss,
  router: appRouter,
  createContext() {
    return {};
  },
});
