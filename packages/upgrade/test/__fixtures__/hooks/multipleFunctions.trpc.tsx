import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';

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
  post: {
    list: t.procedure.query(() => {
      return ['initial', 'optimistic'];
    }),
  },
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
