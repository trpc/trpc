import { on } from 'node:events';
import { error, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';
import { db } from '../db.ts';
import { authed, t } from './trpc.ts';

export const appRouter = t.router({
  post: {
    list: t.procedure.query(() => db.list()),
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(
        (opts) =>
          db.byId(opts.input.id) ??
          error({ code: 'NOT_FOUND', message: `No post ${opts.input.id}` }),
      ),
    add: authed
      .input(z.object({ title: z.string().min(1, 'Give the post a title') }))
      .mutation((opts) => db.add(opts.input.title, opts.ctx.user)),
    // v11 clients send `lastEventId` in the input; createV11Handler passes it here too.
    onAdd: t.procedure.subscription(async function* (opts) {
      const live = on(db.events, 'add', { signal: opts.signal });
      let last = Number(opts.lastEventId ?? 0);
      for (const post of db.after(opts.lastEventId)) {
        last = Number(post.id);
        yield tracked(post.id, post);
      }
      for await (const [post] of live) {
        if (Number(post.id) > last) yield tracked(post.id, post);
      }
    }),
  },
});

export type AppRouter = typeof appRouter;
