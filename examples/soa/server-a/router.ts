import { publicProcedure, router } from '../server-lib/index.js';

export const serverA_appRouter = router({
  greet: publicProcedure
    .input((val: unknown) => {
      if (typeof val === 'string') return val;
      throw new Error(`Invalid input: ${typeof val}`);
    })
    .query(async (opts) => {
      return `[from server A]: hello, ${opts.input}!` as const;
    }),
});
