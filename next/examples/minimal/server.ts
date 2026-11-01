/**
 * Minimal example: a router served with Effect's Node `HttpServer`. `client.ts`
 * calls it with the typed client; `pnpm start` runs both.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import {
  createFetchHandler,
  error,
  initTrpc,
  tracked,
} from '@trpc12/trpc/server';
import { z } from 'zod';

interface Post {
  id: string;
  title: string;
}
const posts = new Map<string, Post>([['1', { id: '1', title: 'Hello v12' }]]);

const t = initTrpc<{ ctx: { user: string | null } }>();

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Send an authorization header' }),
);

const appRouter = t.router({
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          posts.get(opts.input.id) ??
          error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
      ),
    create: authed
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) => {
        const post: Post = {
          id: String(posts.size + 1),
          title: opts.input.title,
        };
        posts.set(post.id, post);
        return post;
      }),
    all: t.procedure.subscription(async function* () {
      for (const post of posts.values()) yield tracked(post.id, post);
    }),
  },
});
export type AppRouter = typeof appRouter;

export async function listen(port = 0) {
  const handler = createFetchHandler({
    router: appRouter,
    batch: true,
    createContext: (opts) => ({
      user: opts.request.headers['authorization'] ?? null,
    }),
  });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${origin}/trpc`,
    [Symbol.asyncDispose]: async () => {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(server.url);
}
