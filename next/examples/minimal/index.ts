/**
 * Minimal example: a router served with Effect's Node `HttpServer`, called
 * with the typed client. Run with `pnpm example`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import {
  createTrpcClient,
  httpLink,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import { serve } from '@trpc12/trpc/http';
import {
  createFetchHandler,
  error,
  initTrpc,
  tracked,
} from '@trpc12/trpc/server';
import { z } from 'zod';

// --- server --------------------------------------------------------------------------

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

const appRouter = {
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
};
export type AppRouter = typeof appRouter;

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
      NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
    ),
  ),
);
const url = await runtime.runPromise(
  HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
);

// --- client --------------------------------------------------------------------------

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    httpLink({
      url: `${url}/trpc`,
      batch: true,
      headers: { authorization: 'ada' },
    }),
  ],
});

const post = await client.post.byId.query({ id: '1' });
console.log('post.byId:', post);

const created = await client.post.create.mutate({ title: 'Typed errors' });
console.log('post.create:', created);

const [, err] = await safe(client.post.byId.query({ id: '404' }));
if (err?.defined && err.code === 'NOT_FOUND') {
  console.log('post.byId failed: no post', err.data.id);
}

for await (const event of client.post.all.subscribe()) {
  console.log('post.all event', event.id, event.data.title);
}

await runtime.dispose();
await handler.dispose();
