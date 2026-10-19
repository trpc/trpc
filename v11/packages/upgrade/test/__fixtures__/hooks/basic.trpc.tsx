import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();
export const appRouter = t.router({
  a: {
    b: {
      c: {
        d: t.procedure.query(() => {
          return 'hello';
        }),
      },
    },
  },
  num: t.procedure.input(z.number()).query(({ input }) => {
    return input;
  }),
  post: {
    list: t.procedure.query(() => {
      return ['initial', 'optimistic'];
    }),
    byId: t.procedure.input(z.object({ id: z.number() })).query(({ input }) => {
      return input;
    }),
  },
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
