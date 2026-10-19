import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();
export const appRouter = t.router({
  //
});
export type AppRouter = typeof appRouter;

export const ctx = testReactResource(appRouter);
export const trpc = ctx.rq;
export const useTRPC = ctx.trq.useTRPC;
