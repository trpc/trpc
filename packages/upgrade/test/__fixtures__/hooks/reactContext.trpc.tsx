import { initTRPC } from '@trpc/server';
import { testReactResource } from '../../__helpers';

export const t = initTRPC.create();
export const appRouter = t.router({
  //
});

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
