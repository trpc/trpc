import { initTRPC } from '@trpc/server';

// needs to be exported for the test to be valid
export const t = initTRPC.create();


const appRouter = t.router({
  foo: t.procedure.query(() => 'bar'),
})

export type AppRouter = typeof appRouter;
