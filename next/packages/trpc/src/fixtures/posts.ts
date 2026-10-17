import { error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc();

export interface Post {
  id: string;
  title: string;
  tags: string[];
  at: Date;
}

export const db = {
  posts: new Map<string, Post>(),
  calls: [] as string[],
  reset() {
    db.calls = [];
    db.posts = new Map([
      ['1', { id: '1', title: 'Hello', tags: ['a'], at: new Date(0) }],
      ['2', { id: '2', title: 'World', tags: ['b'], at: new Date(1) }],
    ]);
  },
};

/** The posts and calls for one test, reset again after: `using _db = freshDb();`. */
export const freshDb = (): Disposable => {
  db.reset();
  return { [Symbol.dispose]: () => db.reset() };
};

export const router = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => {
      db.calls.push(`byId:${input.id}`);
      const post = db.posts.get(input.id);
      return post
        ? structuredClone(post)
        : error({ code: 'NOT_FOUND', data: { id: input.id } });
    }),
    list: t.procedure
      .input(z.object({ limit: z.number(), order: z.enum(['asc', 'desc']) }))
      .query((opts) => {
        db.calls.push('list');
        const posts = [...db.posts.values()].map((post) =>
          structuredClone(post),
        );
        if (opts.input.order === 'desc') posts.reverse();
        return posts.slice(0, opts.input.limit);
      }),
    count: t.procedure.query(() => {
      db.calls.push('count');
      return db.posts.size;
    }),
    tagSet: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      db.calls.push(`tagSet:${opts.input.id}`);
      return new Set(db.posts.get(opts.input.id)?.tags);
    }),
    nested: t.procedure.input(z.object({ depth: z.number() })).query((opts) => {
      let value: { child?: unknown } = {};
      for (let i = 0; i < opts.input.depth; i++) value = { child: value };
      return value;
    }),
    since: t.procedure.input(z.object({ at: z.date() })).query((opts) => {
      db.calls.push(`since:${opts.input.at.getTime()}`);
      return [...db.posts.values()].filter((post) => post.at >= opts.input.at)
        .length;
    }),
    many: t.procedure
      .input(z.object({ ids: z.array(z.string()) }))
      .query((opts) => {
        db.calls.push(`many:${opts.input.ids.join(',')}`);
        return opts.input.ids.map((id) => db.posts.get(id)?.title ?? null);
      }),
    rename: t.procedure
      .input(z.object({ id: z.string(), title: z.string() }))
      .mutation(({ input }) => {
        db.calls.push(`rename:${input.id}`);
        const post = db.posts.get(input.id)!;
        db.posts.set(input.id, { ...post, title: input.title });
        return input.title;
      }),
    onRename: t.procedure.subscription(async function* () {
      yield 'first';
      yield 'latest';
    }),
  },
};

export type AppRouter = typeof router;

export const tick = (ms = 0): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
