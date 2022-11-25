import { initTRPC, router } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';

const t = initTRPC.create();

const legacyRouter = router()
  .query('hello', {
    input: z
      .object({
        text: z.string().nullish(),
      })
      .nullish(),
    resolve({ input }) {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  })
  .interop();

const v10Router = t.router({
  foo: t.procedure.query(() => 'bar' as const),
});
const appRouter = t.mergeRouters(legacyRouter, v10Router);

// export type definition of API
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
