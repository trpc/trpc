/**
 * The app the open questions' and decisions' code blocks build on: a blog
 * whose procedures declare errors, stream and subscribe. Blocks import it
 * as `./server.ts` behind a cut.
 */
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
}

export interface User {
  id: string;
  name: string;
}

export interface Context {
  user: User | null;
}

const posts = new Map<string, Post>([['1', { id: '1', title: 'Hello v12' }]]);

export const db = {
  post: {
    find: (id: string) => posts.get(id),
    list: () => [...posts.values()],
    create: (title: string) => {
      const post: Post = { id: String(posts.size + 1), title };
      posts.set(post.id, post);
      return post;
    },
  },
};

export const t = initTrpc<{ ctx: Context }>();

export const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
    list: t.procedure.query(async function* () {
      yield* db.post.list();
    }),
    create: authed
      .errors({ CONFLICT: { message: 'A post has this title' } })
      .input(z.object({ title: z.string().min(1) }))
      .mutation((opts) =>
        db.post.list().some((post) => post.title === opts.input.title)
          ? opts.errors.CONFLICT()
          : db.post.create(opts.input.title),
      ),
    onCreated: t.procedure.subscription(async function* () {
      yield* db.post.list();
    }),
  },
});

export type AppRouter = typeof appRouter;

export const handler = createFetchHandler({
  router: appRouter,
  createContext: () => ({ user: null }),
});
