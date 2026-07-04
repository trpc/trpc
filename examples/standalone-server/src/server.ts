import { initTRPC } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

// This is how you initialize a context for the server
function createContext(
  opts: CreateHTTPContextOptions | CreateWSSContextFnOptions,
) {
  return {};
}
type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const router = t.router;

const greetingRouter = router({
  hello: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(({ input }) => `Hello, ${input.name}!`),
});

const postRouter = router({
  createPost: publicProcedure
    .input(
      z.object({
        title: z.string(),
        text: z.string(),
      }),
    )
    .mutation(({ input }) => {
      // imagine db call here
      return {
        id: `${Math.random()}`,
        ...input,
      };
    }),
  randomNumber: publicProcedure.subscription(async function* ({ signal }) {
    // Loop until the client disconnects and triggers the abort signal
    while (!signal?.aborted) {
      // Yield the random number instead of using emit.next()
      yield { randomNumber: Math.random() };
      
      // Wait for 200ms before the next loop instead of using setInterval
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }),
});

// Merge routers together
const appRouter = router({
  greeting: greetingRouter,
  post: postRouter,
});

export type AppRouter = typeof appRouter;

// http server
const server = createHTTPServer({
  router: appRouter,
  createContext,
});

// ws server
const wss = new WebSocketServer({ server });
applyWSSHandler<AppRouter>({
  wss,
  router: appRouter,
  createContext,
});

// setInterval(() => {
//   console.log('Connected clients', wss.clients.size);
// }, 1000);
server.listen(2022);
