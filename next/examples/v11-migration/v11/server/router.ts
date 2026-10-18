import { on } from 'node:events';
import { tracked, TRPCError } from '@trpc/server';
import { z } from 'zod';
import { db } from '../../db.ts';
import { authedProcedure, publicProcedure, router } from './trpc.ts';

export const appRouter = router({
  post: router({
    list: publicProcedure.query(() => db.list()),
    byId: publicProcedure.input(z.object({ id: z.string() })).query((opts) => {
      const post = db.byId(opts.input.id);
      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No post ${opts.input.id}`,
        });
      }
      return post;
    }),
    add: authedProcedure
      .input(z.object({ title: z.string().min(1, 'Give the post a title') }))
      .mutation((opts) => db.add(opts.input.title, opts.ctx.user)),
    onAdd: publicProcedure
      .input(z.object({ lastEventId: z.string().nullish() }).optional())
      .subscription(async function* (opts) {
        const live = on(db.events, 'add', { signal: opts.signal });
        let last = Number(opts.input?.lastEventId ?? 0);
        for (const post of db.after(opts.input?.lastEventId)) {
          last = Number(post.id);
          yield tracked(post.id, post);
        }
        for await (const [post] of live) {
          if (Number(post.id) > last) yield tracked(post.id, post);
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
