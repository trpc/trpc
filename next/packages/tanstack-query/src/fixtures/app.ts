import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  routerType,
  type TrpcClient,
} from '@trpc12/trpc/client';
import { createSerializer, type DansonForm } from '@trpc12/trpc/serializer';
import { error, initTrpc } from '@trpc12/trpc/server';
import { TestServer } from '@trpc12/trpc/internal/testing';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  createdAt: Date;
}

/** Posts carry `Date`s through hydration, so both ends use danSON. */
export const serializer = createSerializer();

/** What the app's links declare: danSON's form. Contexts take it as their links' types. */
export type Links = { form: DansonForm };

export type AppClient = TrpcClient<AppRouter, {}, undefined, Links>;

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Server-side state, reset by {@link createApp}. */
export const db = {
  posts: new Map<string, Post>(),
  listeners: new Set<(post: Post) => void>(),
  calls: [] as string[],
  openTickers: 0,
  /** Open `chat.forever` streams. */
  openChats: 0,
  /** Values of `ctx.locale` the server saw. */
  locales: [] as (string | null)[],
};

function addPost(title: string): Post {
  const id = String(db.posts.size + 1);
  const post: Post = {
    id,
    title,
    createdAt: new Date(Date.UTC(2026, 0, 1 + +id)),
  };
  db.posts.set(id, post);
  for (const listener of db.listeners) listener(post);
  return post;
}

const t = initTrpc<{ ctx: { locale: string | null } }>();

export const appRouter = {
  greeting: t.procedure.query((opts) => {
    db.locales.push(opts.ctx.locale);
    return 'hello' as const;
  }),
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
      db.calls.push(`post.byId:${input.id}`);
      const post = db.posts.get(input.id);
      return post ?? error({ code: 'NOT_FOUND', data: { id: input.id } });
    }),
    list: t.procedure
      .input(z.object({ limit: z.number(), cursor: z.number().optional() }))
      .query(({ input }) => {
        const all = [...db.posts.values()];
        const start = input.cursor ?? 0;
        const items = all.slice(start, start + input.limit);
        const next = start + input.limit;
        return { items, nextCursor: next < all.length ? next : undefined };
      }),
    create: t.procedure
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) => addPost(opts.input.title)),
    onAdd: t.procedure.subscription(async function* (opts) {
      const queue: Post[] = [];
      let wake: (() => void) | undefined;
      const listener = (post: Post) => {
        queue.push(post);
        wake?.();
      };
      db.listeners.add(listener);
      try {
        while (!opts.signal.aborted) {
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            opts.signal.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });
        }
      } finally {
        db.listeners.delete(listener);
      }
    }),
  },
  chat: {
    reply: t.procedure
      .input(z.object({ prompt: z.string() }))
      .query(async function* (opts) {
        for (const word of `you said ${opts.input.prompt}`.split(' ')) {
          await sleep(5);
          yield word;
        }
      }),
    forever: t.procedure.mutation(async function* (opts) {
      db.openChats++;
      try {
        for (let n = 0; !opts.signal.aborted; n++) {
          await sleep(5);
          yield n;
        }
      } finally {
        db.openChats--;
      }
    }),
    send: t.procedure
      .input(z.object({ text: z.string() }))
      .mutation(async function* (opts) {
        for (const word of `ok ${opts.input.text}`.split(' ')) {
          await sleep(5);
          yield word;
        }
      }),
  },
  clock: {
    ticks: t.procedure
      .input(z.object({ from: z.number() }))
      .subscription(async function* (opts) {
        db.openTickers++;
        try {
          for (let n = opts.input.from; !opts.signal.aborted; n++) {
            yield n;
            await sleep(10);
          }
        } finally {
          db.openTickers--;
        }
      }),
    countdown: t.procedure
      .input(z.object({ from: z.number() }))
      .subscription(async function* (opts) {
        for (let n = opts.input.from; n > 0; n--) yield n;
        if (opts.input.from === 0) throw error({ code: 'CONFLICT' });
      }),
  },
};
export type AppRouter = typeof appRouter;

/**
 * Starts the app on a real HTTP server with fresh state, and returns a
 * typed client and its TanStack helpers.
 */
export async function createApp(opts: { posts?: number } = {}) {
  db.posts.clear();
  db.listeners.clear();
  db.calls.length = 0;
  db.locales.length = 0;
  for (let i = 1; i <= (opts.posts ?? 3); i++) addPost(`Post ${i}`);

  const scope = Scope.makeUnsafe();
  const server = Context.get(
    await Effect.runPromise(
      Layer.buildWithScope(
        TestServer.layer({
          router: appRouter,
          serializer,
          createContext: (args) => ({
            locale: args.request.headers['x-locale'] ?? null,
          }),
        }).pipe(
          Layer.provide(
            NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
          ),
        ),
        scope,
      ),
    ),
    TestServer,
  );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [dedupeLink(), httpLink({ url: server.url, serializer })],
  });
  const trpc = createTrpcQueryUtils({ client });
  return {
    server,
    client,
    trpc,
    addPost,
    [Symbol.asyncDispose]: () =>
      Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}
