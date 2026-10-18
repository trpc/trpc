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
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  createdAt: Date;
}

const t = initTrpc();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const posts: Post[] = [
  { id: '1', title: 'Read with use() and Suspense', createdAt: new Date(0) },
];

export const appRouter = {
  post: {
    list: t.procedure.query(async () => {
      await sleep(50);
      return posts;
    }),
    add: t.procedure
      .input(z.object({ title: z.string().trim().min(1) }))
      .mutation((opts) => {
        const post: Post = {
          id: String(posts.length + 1),
          title: opts.input.title,
          createdAt: new Date(),
        };
        posts.push(post);
        return post;
      }),
  },
  clock: t.procedure.subscription(async function* () {
    for (let tick = 1; ; tick++) {
      yield { tick, at: new Date() };
      await sleep(250);
    }
  }),
};
export type AppRouter = typeof appRouter;

// danSON on both ends, so `createdAt` and `at` arrive as `Date`s.
const handler = createFetchHandler({
  router: appRouter,
  serializer: createSerializer(),
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
  console.log(`listening on ${server.url}; pnpm dev serves the page`);
}
