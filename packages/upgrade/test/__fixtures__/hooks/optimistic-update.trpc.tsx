import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const posts = ['initial'];

export const t = initTRPC.create();
export const appRouter = t.router({
  post: {
    list: t.procedure.query(() => {
      return posts;
    }),
    create: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation((opts) => {
        posts.push(opts.input.title);
        return opts.input.title;
      }),
  },
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;

export const resetFixtureState = () => {
  posts.length = 1;
};
