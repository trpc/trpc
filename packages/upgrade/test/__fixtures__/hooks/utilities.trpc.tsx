import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const posts = [{ id: 1, title: 'initial' }];

export const t = initTRPC.create();
export const appRouter = t.router({
  post: {
    list: t.procedure.query(() => {
      return posts;
    }),
    paginate: t.procedure
      .input(z.object({ cursor: z.number() }))
      .query(({ input }) => {
        const cursor = posts.findIndex((p) => p.id === input.cursor);
        const nextCursor = cursor + 1;
        return { items: posts.slice(cursor, nextCursor), nextCursor };
      }),
    byId: t.procedure.input(z.object({ id: z.number() })).query(({ input }) => {
      return posts.find((p) => p.id === input.id);
    }),
  },
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
