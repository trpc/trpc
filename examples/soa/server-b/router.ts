import { publicProcedure, router } from '../server-lib/index.js';

export const serverB_appRouter = router({
  foo: publicProcedure.query(async () => {
    return '[from server B]: bar' as const;
  }),
});
