import { publicProcedure, router } from '../server-lib';

export const serverB_appRouter = router({
  foo: publicProcedure.query(() => 'bar' as const),
});
