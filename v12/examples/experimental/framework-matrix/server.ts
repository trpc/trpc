import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Scope } from 'effect';
import { toHttpEffect } from '@trpc12/trpc/http';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { type Framework, frameworks } from './src/frameworks.ts';

const t = initTrpc();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const votes: Record<Framework, number> = { vue: 0, solid: 0, svelte: 0 };

// One poll, read and voted on by every page.
export const appRouter = t.router({
  votes: {
    list: t.procedure.query(() => ({ ...votes, at: new Date() })),
    cast: t.procedure
      .input(z.object({ framework: z.enum(frameworks) }))
      .mutation((opts) => ++votes[opts.input.framework]),
  },
  clock: t.procedure.subscription(async function* () {
    for (let tick = 1; ; tick++) {
      yield { tick, at: new Date() };
      await sleep(250);
    }
  }),
});
export type AppRouter = typeof appRouter;

const handler = createFetchHandler({
  router: appRouter,
  transformer: experimental_createProgressiveJson(),
});

/**
 * The handler as Node middleware for `/trpc`: Vite's dev and preview servers
 * mount it, and `listen()` serves it with `node:http`.
 */
export async function trpcMiddleware() {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
  );
  return {
    middleware: (
      req: IncomingMessage,
      res: ServerResponse,
      next: () => void,
    ) => {
      if (req.url?.startsWith('/trpc')) nodeHandler(req, res);
      else next();
    },
    async close() {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      await handler.dispose();
    },
  };
}

export async function listen(port = 0) {
  const trpc = await trpcMiddleware();
  const server = createServer((req, res) =>
    trpc.middleware(req, res, () => res.writeHead(404).end()),
  );
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/trpc`,
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      server.close();
      await trpc.close();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(`listening on ${server.url}; pnpm dev serves the pages`);
}
