import { testReactResource } from '../../__helpers';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();
export const appRouter = t.router({
  //
});

export const {} = testReactResource(appRouter);
