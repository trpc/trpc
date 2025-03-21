import { publicProcedure, router } from '@monotest/trpc';

export const router01 = router({
  foo: publicProcedure.query(() => 'bar' as const),
  child: router({
    grandchild: router({
      proc: publicProcedure.query(() => 'greatgrandchild' as const),
    }),
  }),
});
