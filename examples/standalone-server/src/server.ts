/* eslint-disable @typescript-eslint/ban-types */
import * as trpc from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import ws from 'ws';
import { z } from 'zod';

type Context = {};

export const appRouter = trpc
  .router<Context>()
  .query('hello', {
    input: z
      .object({
        name: z.string(),
      })
      .nullish(),
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
  })
  .subscription('randomNumber', {
    resolve() {
      return new trpc.Subscription<{ randomNumber: number }>((emit) => {
        const timer = setInterval(() => {
          // emits a number every second
          emit.data({ randomNumber: Math.random() });
        }, 200);

        return () => {
          clearInterval(timer);
        };
      });
    },
  });

export type AppRouter = typeof appRouter;

// http server
const { server, listen } = createHTTPServer({
  router: appRouter,
  createContext() {
    return {};
  },
});

// ws server
const wss = new ws.Server({ server });
applyWSSHandler<AppRouter>({
  wss,
  router: appRouter,
  createContext() {
    return {};
  },
});

// setInterval(() => {
//   console.log('Connected clients', wss.clients.size);
// }, 1000);
listen(2022);
