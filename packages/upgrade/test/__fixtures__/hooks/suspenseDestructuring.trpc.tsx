import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();
export const appRouter = t.router({
  post: {
    list: t.procedure.query(() => {
      return ['initial', 'optimistic'];
    }),
    infinite: t.procedure
      .input(z.object({ cursor: z.number().optional(), channelId: z.string() }))
      .query(() => {
        return {
          nextCursor: 2,
          items: ['initial', 'optimistic'],
        };
      }),
  },
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
