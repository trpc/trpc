import { publicProcedure, router } from '../server-lib/index.js';

export const serverB_appRouter = router({
  foo: publicProcedure.query(() => 'bar' as const),
});
