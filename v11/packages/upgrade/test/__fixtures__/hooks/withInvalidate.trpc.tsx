import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();
export const appRouter = t.router({
  post: {
    list: t.procedure
      .input(z.object({ cursor: z.number().optional(), channelId: z.string() }))
      .query(() => {
        return {
          nextCursor: 2,
          items: ['initial', 'optimistic'],
        };
      }),
    create: t.procedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => {
        return input;
      }),
    byId: t.procedure.input(z.object({ id: z.number() })).query(({ input }) => {
      return input;
    }),
    x: { y: { z: { longPropName: t.procedure.query(() => 'hello') } } },
  },
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
