import * as trpc from '@trpc/server';
import { inferAsyncReturnType } from '@trpc/server';
import * as trpcNext from '@trpc/server/dist/adapters/next';
import * as z from 'zod';
// The app's context - is generated for each incoming request
export async function createContext(opts?: trpcNext.CreateNextContextOptions) {
  return {
    req: opts?.req,
    res: opts?.res,
  };
}
type Context = inferAsyncReturnType<typeof createContext>;

export function createRouter() {
  return trpc.router<Context>();
}

const waitFor = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Important: only use this export with SSR/SSG
export const appRouter = createRouter()
  .query('slow-query-cached', {
    input: z.object({
      id: z.string(),
    }),
    async resolve({ ctx, input }) {
      ctx.res?.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

      await waitFor(3000); // wait for 5s

      return {
        input,
        lastUpdated: new Date().toJSON(),
      };
    },
  })
  .query('slow-query-uncached', {
    input: z.object({
      id: z.string(),
    }),
    async resolve({ input }) {
      await waitFor(3000); // wait for 5s

      return {
        input,
        lastUpdated: new Date().toJSON(),
      };
    },
  });

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
});
